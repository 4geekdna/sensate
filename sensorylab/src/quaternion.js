const EPSILON = 1e-12;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function quaternionMagnitude(q) {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

export function normalizeQuaternion(q) {
  const magnitude = quaternionMagnitude(q);
  if (!Number.isFinite(magnitude) || magnitude < EPSILON) {
    throw new Error("Quaternion magnitude is zero or invalid.");
  }
  return {
    w: q.w / magnitude,
    x: q.x / magnitude,
    y: q.y / magnitude,
    z: q.z / magnitude,
  };
}

export function conjugateQuaternion(q) {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

export function inverseQuaternion(q) {
  const magnitudeSquared =
    q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
  if (!Number.isFinite(magnitudeSquared) || magnitudeSquared < EPSILON) {
    throw new Error("Cannot invert a zero or invalid quaternion.");
  }
  const conjugate = conjugateQuaternion(q);
  return {
    w: conjugate.w / magnitudeSquared,
    x: conjugate.x / magnitudeSquared,
    y: conjugate.y / magnitudeSquared,
    z: conjugate.z / magnitudeSquared,
  };
}

export function multiplyQuaternions(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quaternionDot(a, b) {
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

export function relativeQuaternion(primary, secondary) {
  return normalizeQuaternion(
    multiplyQuaternions(
      inverseQuaternion(normalizeQuaternion(primary)),
      normalizeQuaternion(secondary),
    ),
  );
}

export function deltaFromReference(reference, current) {
  return normalizeQuaternion(
    multiplyQuaternions(
      inverseQuaternion(normalizeQuaternion(reference)),
      normalizeQuaternion(current),
    ),
  );
}

export function quaternionAngleDegrees(q) {
  const normalized = normalizeQuaternion(q);
  const halfAngle = Math.acos(clamp(Math.abs(normalized.w), 0, 1));
  return (2 * halfAngle * 180) / Math.PI;
}

export function angleBetweenQuaternions(a, b) {
  return quaternionAngleDegrees(relativeQuaternion(a, b));
}

export function averageQuaternions(quaternions) {
  if (!quaternions.length) {
    throw new Error("At least one quaternion is required.");
  }

  const anchor = normalizeQuaternion(quaternions[0]);
  const total = { w: 0, x: 0, y: 0, z: 0 };

  for (const input of quaternions) {
    let q = normalizeQuaternion(input);
    if (quaternionDot(anchor, q) < 0) {
      q = { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
    }
    total.w += q.w;
    total.x += q.x;
    total.y += q.y;
    total.z += q.z;
  }

  return normalizeQuaternion(total);
}

export function orientationSwayRmsDegrees(quaternions) {
  if (quaternions.length < 2) return null;
  const mean = averageQuaternions(quaternions);
  const squared = quaternions.map((q) => {
    const angle = angleBetweenQuaternions(mean, q);
    return angle * angle;
  });
  return Math.sqrt(squared.reduce((sum, value) => sum + value, 0) / squared.length);
}

export function quaternionFromAxisAngle(axis, angleDegrees) {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length < EPSILON) throw new Error("Axis must be non-zero.");
  const half = (angleDegrees * Math.PI) / 360;
  const scale = Math.sin(half) / length;
  return normalizeQuaternion({
    w: Math.cos(half),
    x: axis.x * scale,
    y: axis.y * scale,
    z: axis.z * scale,
  });
}

