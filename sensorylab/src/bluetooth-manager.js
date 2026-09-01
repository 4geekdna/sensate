import { WT901BLE } from "./constants.js";
import { decodeWT901BLENotification } from "./wt901ble.js";

function emit(target, name, detail) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

export class BluetoothManager extends EventTarget {
  #records = new Map();

  get supported() {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  get devices() {
    return Array.from(this.#records.values(), (record) => this.#snapshot(record));
  }

  getDevice(id) {
    const record = this.#records.get(id);
    return record ? this.#snapshot(record) : null;
  }

  #snapshot(record) {
    return {
      id: record.device.id,
      advertisedName: record.device.name || "WT901BLE",
      state: record.state,
      connected: Boolean(record.device.gatt?.connected),
      ready: record.state === "ready",
      error: record.error,
      notificationActive: Boolean(record.notifyCharacteristic),
      canForget: typeof record.device.forget === "function",
      source: "bluetooth",
    };
  }

  #addDevice(device) {
    let record = this.#records.get(device.id);
    if (record) return record;

    record = {
      device,
      state: "discovered",
      error: null,
      server: null,
      service: null,
      notifyCharacteristic: null,
      writeCharacteristic: null,
      notificationHandler: null,
      disconnectHandler: null,
      pendingBytes: new Uint8Array(),
    };

    record.disconnectHandler = () => {
      record.state = "disconnected";
      record.server = null;
      record.service = null;
      record.notifyCharacteristic = null;
      record.writeCharacteristic = null;
      emit(this, "diagnostic", {
        level: "warning",
        deviceId: device.id,
        message: "WT901BLE disconnected.",
      });
      emit(this, "devicechanged", this.#snapshot(record));
    };
    device.addEventListener("gattserverdisconnected", record.disconnectHandler);
    this.#records.set(device.id, record);
    emit(this, "devicechanged", this.#snapshot(record));
    return record;
  }

  async restoreGrantedDevices() {
    if (!this.supported || typeof navigator.bluetooth.getDevices !== "function") {
      return [];
    }
    try {
      const devices = await navigator.bluetooth.getDevices();
      devices.forEach((device) => this.#addDevice(device));
      return this.devices;
    } catch (error) {
      emit(this, "diagnostic", {
        level: "warning",
        message: "Previously granted Bluetooth devices could not be restored.",
        error: error.message,
      });
      return [];
    }
  }

  async requestAndConnect() {
    if (!this.supported) {
      throw new Error("Web Bluetooth is unavailable in this browser.");
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [WT901BLE.service] },
        { namePrefix: "WT901" },
        { namePrefix: "WT" },
      ],
      optionalServices: [WT901BLE.service],
    });
    const record = this.#addDevice(device);
    await this.connect(device.id);
    return this.#snapshot(record);
  }

  async connect(deviceId) {
    const record = this.#records.get(deviceId);
    if (!record) throw new Error("Bluetooth device is not known to this origin.");
    if (!record.device.gatt) throw new Error("The selected device has no GATT server.");
    if (record.state === "connecting" || record.state === "ready") {
      return this.#snapshot(record);
    }

    try {
      record.error = null;
      record.state = "connecting";
      emit(this, "devicechanged", this.#snapshot(record));
      record.server = await record.device.gatt.connect();

      record.state = "discovering";
      emit(this, "devicechanged", this.#snapshot(record));
      record.service = await record.server.getPrimaryService(WT901BLE.service);
      const [notifyCharacteristic, writeCharacteristic] = await Promise.all([
        record.service.getCharacteristic(WT901BLE.notify),
        record.service.getCharacteristic(WT901BLE.write),
      ]);
      record.notifyCharacteristic = notifyCharacteristic;
      record.writeCharacteristic = writeCharacteristic;

      record.state = "subscribing";
      emit(this, "devicechanged", this.#snapshot(record));
      record.notificationHandler = (event) => {
        const timestamp = Date.now();
        const incoming = new Uint8Array(
          event.target.value.buffer,
          event.target.value.byteOffset,
          event.target.value.byteLength,
        );
        const combined = new Uint8Array(record.pendingBytes.length + incoming.length);
        combined.set(record.pendingBytes);
        combined.set(incoming, record.pendingBytes.length);
        const decoded = decodeWT901BLENotification(combined, timestamp);
        record.pendingBytes = decoded.remainder;
        for (const frame of decoded.frames) {
          emit(this, "samples", {
            deviceId,
            samples: frame.samples,
            frameType: frame.type,
            rawHex: frame.rawHex,
          });
        }
        for (const error of decoded.errors) {
          if (error.code === "PARTIAL_FRAME") continue;
          emit(this, "decodeerror", { deviceId, error });
          emit(this, "diagnostic", {
            level: "warning",
            deviceId,
            message: error.message,
            code: error.code,
          });
        }
      };
      notifyCharacteristic.addEventListener(
        "characteristicvaluechanged",
        record.notificationHandler,
      );
      await notifyCharacteristic.startNotifications();

      record.state = "ready";
      emit(this, "devicechanged", this.#snapshot(record));
      emit(this, "diagnostic", {
        level: "info",
        deviceId,
        message: "WT901BLE connected and notifications active.",
      });

      try {
        await this.requestMagneticField(deviceId);
      } catch (error) {
        emit(this, "diagnostic", {
          level: "warning",
          deviceId,
          message: "Connected, but the magnetic-field request was not acknowledged.",
          error: error.message,
        });
      }
      return this.#snapshot(record);
    } catch (error) {
      record.state = "failed";
      record.error = error.message;
      emit(this, "devicechanged", this.#snapshot(record));
      emit(this, "diagnostic", {
        level: "error",
        deviceId,
        message: "WT901BLE connection failed.",
        error: error.message,
      });
      throw error;
    }
  }

  async requestMagneticField(deviceId) {
    const record = this.#records.get(deviceId);
    if (!record?.writeCharacteristic) {
      throw new Error("WT901BLE write characteristic is unavailable.");
    }
    if (typeof record.writeCharacteristic.writeValueWithResponse === "function") {
      await record.writeCharacteristic.writeValueWithResponse(
        WT901BLE.magneticFieldCommand,
      );
    } else {
      await record.writeCharacteristic.writeValue(WT901BLE.magneticFieldCommand);
    }
    emit(this, "diagnostic", {
      level: "info",
      deviceId,
      message: "Magnetic-field data requested.",
    });
  }

  disconnect(deviceId) {
    const record = this.#records.get(deviceId);
    if (!record) return;
    record.state = "disconnecting";
    emit(this, "devicechanged", this.#snapshot(record));
    if (record.device.gatt?.connected) record.device.gatt.disconnect();
    else {
      record.state = "disconnected";
      emit(this, "devicechanged", this.#snapshot(record));
    }
  }

  async forget(deviceId) {
    const record = this.#records.get(deviceId);
    if (!record) return;
    this.disconnect(deviceId);
    if (typeof record.device.forget === "function") {
      await record.device.forget();
    }
    this.#records.delete(deviceId);
    emit(this, "deviceremoved", { deviceId });
  }
}
