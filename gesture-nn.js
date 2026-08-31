(() => {
  const WIT_SERVICE='0000ffe5-0000-1000-8000-00805f9a34fb';
  const WIT_NOTIFY='0000ffe4-0000-1000-8000-00805f9a34fb';
  const WIT_WRITE='0000ffe9-0000-1000-8000-00805f9a34fb';
  const STD_SERVICE='0000ffe5-0000-1000-8000-00805f9b34fb';
  const STD_NOTIFY='0000ffe4-0000-1000-8000-00805f9b34fb';
  const STD_WRITE='0000ffe9-0000-1000-8000-00805f9b34fb';
  const UART_SERVICE='49535343-fe7d-4ae5-8fa9-9fafd205e455';
  const UART_TX='49535343-1e4d-4bd9-ba61-23c647249616';
  const UART_RX='49535343-8841-43f4-a8d4-ecbe34729bb3';
  const DEFAULT_LABELS=['Rest','Wave','Circle','Flick','Chop','Twist','Punch','Figure-8','Raise','Snap'];
  const STORE='sensate-gestures-v1';
  const FEATS=9;
  const $ = id => document.getElementById(id);
  const logEl = $('log');
  function log(m){
    const t=new Date().toLocaleTimeString();
    logEl.textContent += '\n[' + t + '] ' + m;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setStatus(t, kind){
    $('status').innerHTML = '<b>' + t + '</b>';
    $('dot').className = 'dot' + (kind==='ok'?' ok':kind==='bad'?' bad':kind==='warn'?' warn':'');
  }
  function warn(t){ $('warn').textContent=t; $('warn').style.display='block'; }
  let device=null, notifyCh=null, writeCh=null, rxBuf=[];
  let zero={roll:0,pitch:0,yaw:0};
  let latest={ax:0,ay:0,az:0,gx:0,gy:0,gz:0,roll:0,pitch:0,yaw:0};
  let ring=[];
  let pkt=0, winPk=0, winT=performance.now();
  let demoTimer=null, demoKind='Rest';
  let labels=DEFAULT_LABELS.slice();
  let activeLabel='Wave';
  let samples=[];
  let model=null, norm=null, listening=false;
  let lossHist=[];
  let recLock=false;
  function winSize(){ return Math.max(24, Math.min(128, Number($('winSize').value)||64)); }
  function loadStore(){
    try{
      const raw=localStorage.getItem(STORE);
      if(!raw) return;
      const d=JSON.parse(raw);
      if(Array.isArray(d.labels) && d.labels.length) labels=d.labels;
      if(Array.isArray(d.samples)) samples=d.samples;
      if(d.activeLabel) activeLabel=d.activeLabel;
    }catch(e){ log('store load failed: '+e.message); }
  }
  function saveStore(){
    localStorage.setItem(STORE, JSON.stringify({labels, samples, activeLabel}));
    renderLabels(); renderSamples();
  }
  function renderLabels(){
    const box=$('labels'); box.innerHTML='';
    labels.forEach(name=>{
      const b=document.createElement('button');
      b.className='chip'+(name===activeLabel?' on':'');
      const n=samples.filter(s=>s.label===name).length;
      b.textContent=name+' ('+n+')';
      b.onclick=function(){ activeLabel=name; saveStore(); };
      box.appendChild(b);
    });
    $('nSamp').textContent=samples.length;
    $('nCls').textContent=new Set(samples.map(s=>s.label)).size;
  }
  function renderSamples(){
    const box=$('samples'); box.innerHTML='';
    samples.slice().reverse().slice(0,40).forEach((s,i)=>{
      const real=samples.length-1-i;
      const row=document.createElement('div');
      row.className='sample';
      row.innerHTML='<span>'+s.label+' \u00b7 '+s.frames.length+' frames \u00b7 '+new Date(s.ts).toLocaleTimeString()+'</span>';
      const del=document.createElement('button');
      del.className='sec'; del.textContent='\u2715';
      del.onclick=function(){ samples.splice(real,1); saveStore(); };
      row.appendChild(del);
      box.appendChild(row);
    });
  }
  function i16(v,o){ return v.getInt16(o,true); }
  function n180(d){ while(d>180)d-=360; while(d<-180)d+=360; return d; }
  function energy(f){ return Math.hypot(f.ax,f.ay,f.az-1) + Math.hypot(f.gx,f.gy,f.gz)/200; }
  function pushFrame(f){
    latest=f; ring.push(f); if(ring.length>256) ring.shift();
    $('acc').textContent=f.ax.toFixed(2)+' / '+f.ay.toFixed(2)+' / '+f.az.toFixed(2)+' g';
    $('gyr').textContent=f.gx.toFixed(0)+' / '+f.gy.toFixed(0)+' / '+f.gz.toFixed(0)+' \u00b0/s';
    $('rpy').textContent=(f.roll-zero.roll).toFixed(1)+' / '+(f.pitch-zero.pitch).toFixed(1)+' / '+n180(f.yaw-zero.yaw).toFixed(1)+'\u00b0';
    $('buf').textContent=Math.min(ring.length,winSize())+' / '+winSize();
    $('eng').textContent=energy(f).toFixed(2);
    drawWave();
    if(listening) classifyLive();
  }
  function parse20(bytes){
    if(bytes.length<20 || bytes[0]!==0x55 || bytes[1]!==0x61) return false;
    const v=new DataView(Uint8Array.from(bytes.slice(0,20)).buffer);
    pushFrame({
      ax:i16(v,2)/32768*16, ay:i16(v,4)/32768*16, az:i16(v,6)/32768*16,
      gx:i16(v,8)/32768*2000, gy:i16(v,10)/32768*2000, gz:i16(v,12)/32768*2000,
      roll:i16(v,14)/32768*180, pitch:i16(v,16)/32768*180, yaw:i16(v,18)/32768*180,
      t:performance.now()
    });
    return true;
  }
  function onNotify(ev){
    const v=ev.target.value; pkt++; winPk++;
    const now=performance.now();
    if(now-winT>=1000){ $('hz').textContent=(winPk*1000/(now-winT)).toFixed(1)+' Hz'; winPk=0; winT=now; }
    const incoming=Array.from({length:v.byteLength},function(_,i){return v.getUint8(i);});
    if(parse20(incoming)){ setStatus('Receiving IMU','ok'); return; }
    rxBuf.push.apply(rxBuf, incoming);
    while(rxBuf.length>=20){
      const idx=rxBuf.findIndex(function(b,i){return b===0x55 && rxBuf[i+1]===0x61;});
      if(idx<0){ rxBuf=rxBuf.slice(-1); break; }
      if(idx>0) rxBuf.splice(0,idx);
      if(rxBuf.length<20) break;
      if(parse20(rxBuf.slice(0,20))){ rxBuf.splice(0,20); setStatus('Receiving IMU','ok'); }
      else rxBuf.shift();
    }
  }
  async function tryProfile(server,label,svc,notify,write){
    log('Trying '+label);
    const s=await server.getPrimaryService(svc);
    notifyCh=await s.getCharacteristic(notify);
    try{ writeCh=await s.getCharacteristic(write); }catch(e){ writeCh=null; }
    await notifyCh.startNotifications();
    notifyCh.addEventListener('characteristicvaluechanged', onNotify);
    $('btnConnect').disabled=true; $('btnDisc').disabled=false; $('btnZero').disabled=false;
    setStatus('Connected \u00b7 '+label,'ok');
    log('Notifications on '+notify);
    return true;
  }
  async function connect(){
    if(!window.isSecureContext){ warn('HTTPS required (GitHub Pages).'); return; }
    if(!navigator.bluetooth){ warn('Web Bluetooth missing. Use desktop/Android Chrome, or Demo IMU.'); return; }
    $('warn').style.display='none';
    try{
      setStatus('Pick sensor...');
      device=await navigator.bluetooth.requestDevice({
        acceptAllDevices:true,
        optionalServices:[WIT_SERVICE,STD_SERVICE,UART_SERVICE,'device_information']
      });
      $('dev').textContent=(device.name||'WT901')+' \u00b7 strap to dorsum of hand';
      device.addEventListener('gattserverdisconnected', function(){
        setStatus('Disconnected','bad');
        $('btnConnect').disabled=false; $('btnDisc').disabled=true; $('btnZero').disabled=true;
      });
      const server=await device.gatt.connect();
      const profiles=[
        ['WIT FFE5',WIT_SERVICE,WIT_NOTIFY,WIT_WRITE],
        ['Std FFE5',STD_SERVICE,STD_NOTIFY,STD_WRITE],
        ['Microchip UART',UART_SERVICE,UART_TX,UART_RX]
      ];
      for(var i=0;i<profiles.length;i++){
        try{ await tryProfile(server,profiles[i][0],profiles[i][1],profiles[i][2],profiles[i][3]); return; }
        catch(e){ log(profiles[i][0]+' '+e.message); }
      }
      setStatus('No WIT profile','bad');
      warn('Connected but no known notify characteristic.');
    }catch(e){ setStatus('Connect failed','bad'); warn(e.name+': '+e.message); log(e.message); }
  }
  function disconnect(){ if(device && device.gatt && device.gatt.connected) device.gatt.disconnect(); }
  function synthFrame(kind, t){
    const w=t/1000;
    let ax=0,ay=0,az=1,gx=0,gy=0,gz=0,roll=0,pitch=0,yaw=0;
    const n=function(){ return Math.random()-0.5; };
    if(kind==='Rest'){ ax+=0.02*n(); ay+=0.02*n(); gx+=4*n(); }
    else if(kind==='Wave'){ ay=Math.sin(w*10)*0.7; gy=Math.cos(w*10)*180; roll=Math.sin(w*10)*35; }
    else if(kind==='Circle'){ ax=Math.cos(w*8)*0.8; ay=Math.sin(w*8)*0.8; gx=-Math.sin(w*8)*120; gy=Math.cos(w*8)*120; }
    else if(kind==='Flick'){ const p=Math.exp(-Math.pow((w%1.2)-0.35,2)*40); ax=p*1.6; gx=p*420; pitch=p*25; }
    else if(kind==='Chop'){ const p=Math.sin(Math.min(Math.PI, (w%1.1)*Math.PI/0.55)); ay=-p*1.1; gx=p*260; roll=-p*50; }
    else if(kind==='Twist'){ gz=Math.sin(w*9)*280; yaw=Math.sin(w*9)*70; az=1+0.05*Math.sin(w*9); }
    else if(kind==='Punch'){ const p=Math.exp(-Math.pow((w%1.0)-0.28,2)*55); ax=p*2.2; gx=p*90; }
    else if(kind==='Figure-8'){ ax=Math.sin(w*6)*0.7; ay=Math.sin(w*12)*0.45; gy=Math.cos(w*6)*140; }
    else if(kind==='Raise'){ const p=Math.min(1, (w%1.6)/0.5); az=1-p*0.4; pitch=p*55; gy=p*40; }
    else if(kind==='Snap'){ const p=Math.exp(-Math.pow((w%0.9)-0.2,2)*80); gz=p*500; gy=p*120; }
    else { ax=Math.sin(w*7)*0.5; gy=Math.cos(w*7)*90; }
    return {ax:ax+0.03*n(), ay:ay+0.03*n(), az:az+0.02*n(), gx:gx+8*n(), gy:gy+8*n(), gz:gz+8*n(), roll:roll+n(), pitch:pitch+n(), yaw:yaw+n(), t:performance.now()};
  }
  function startDemo(){
    stopDemo();
    demoKind=activeLabel||'Wave';
    log('Demo IMU streaming as '+demoKind);
    setStatus('Demo IMU \u00b7 '+demoKind,'warn');
    $('btnStopDemo').disabled=false;
    demoTimer=setInterval(function(){ pushFrame(synthFrame(demoKind, performance.now())); }, 20);
  }
  function stopDemo(){
    if(demoTimer){ clearInterval(demoTimer); demoTimer=null; }
    $('btnStopDemo').disabled=true;
  }
  function frameVec(f){
    return [f.ax, f.ay, f.az, f.gx/2000, f.gy/2000, f.gz/2000, n180(f.roll-zero.roll)/180, n180(f.pitch-zero.pitch)/180, n180(f.yaw-zero.yaw)/180];
  }
  function takeWindow(){
    const n=winSize();
    if(ring.length<n) return null;
    return ring.slice(-n).map(frameVec);
  }
  const sleep=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  async function recordOne(){
    if(recLock) return;
    if(!activeLabel){ warn('Pick a label first.'); return; }
    recLock=true;
    const sec=Math.max(0.4, Number($('recSec').value)||1.3);
    $('recHint').textContent='Recording '+activeLabel+' in 0.4s...';
    await sleep(400);
    const until=performance.now()+sec*1000;
    $('recHint').textContent='Hold the '+activeLabel+' gesture...';
    demoKind=activeLabel;
    while(performance.now()<until) await sleep(30);
    if(ring.length<winSize()){
      $('recHint').textContent='Not enough frames. Connect sensor or start Demo IMU.';
      recLock=false; return;
    }
    samples.push({label:activeLabel, frames:takeWindow(), ts:Date.now(), src: demoTimer?'demo':'ble'});
    saveStore();
    $('recHint').textContent='Saved '+activeLabel+'. '+samples.filter(function(s){return s.label===activeLabel;}).length+' samples for this class.';
    recLock=false;
  }
  async function recordBurst(){
    for(let i=0;i<5;i++){ $('recHint').textContent='Burst '+(i+1)+'/5'; await recordOne(); await sleep(350); }
  }
  function classList(){ return Array.from(new Set(samples.map(function(s){return s.label;}))).sort(); }
  function resample(frames, n){
    if(frames.length===n) return frames;
    const out=[];
    for(let i=0;i<n;i++){
      const x=i*(frames.length-1)/(n-1);
      const a=Math.floor(x), b=Math.min(frames.length-1,a+1), t=x-a;
      const va=frames[a], vb=frames[b];
      out.push(va.map(function(v,k){ return v*(1-t)+vb[k]*t; }));
    }
    return out;
  }
  function augment(frames){
    const shift=Math.floor((Math.random()-0.5)*6);
    const scale=0.85+Math.random()*0.3;
    const noise=0.02;
    const n=frames.length;
    const src=frames.map(function(r){ return r.slice(); });
    if(shift>0) for(let i=0;i<shift;i++) src.unshift(src[0]);
    if(shift<0) for(let i=0;i<-shift;i++) src.push(src[src.length-1]);
    return src.slice(0,n).map(function(row){ return row.map(function(v){ return v*scale+(Math.random()-0.5)*noise; }); });
  }
  function computeNorm(X){
    const d=FEATS, mean=new Array(d).fill(0), std=new Array(d).fill(0);
    let n=0;
    X.forEach(function(win){ win.forEach(function(row){ n++; row.forEach(function(v,i){ mean[i]+=v; }); }); });
    mean.forEach(function(_,i){ mean[i]/=n; });
    X.forEach(function(win){ win.forEach(function(row){ row.forEach(function(v,i){ std[i]+=(v-mean[i])*(v-mean[i]); }); }); });
    std.forEach(function(_,i){ std[i]=Math.sqrt(std[i]/n)||1; });
    return {mean:mean, std:std};
  }
  function applyNorm(win, nrm){
    return win.map(function(row){ return row.map(function(v,i){ return (v-nrm.mean[i])/nrm.std[i]; }); });
  }
  function buildModel(arch, nCls, T){
    const m=tf.sequential();
    if(arch==='cnn'){
      m.add(tf.layers.conv1d({filters:32, kernelSize:5, activation:'relu', inputShape:[T, FEATS]}));
      m.add(tf.layers.batchNormalization());
      m.add(tf.layers.conv1d({filters:64, kernelSize:3, activation:'relu'}));
      m.add(tf.layers.maxPooling1d({poolSize:2}));
      m.add(tf.layers.dropout({rate:0.25}));
      m.add(tf.layers.conv1d({filters:64, kernelSize:3, activation:'relu'}));
      m.add(tf.layers.globalAveragePooling1d());
      m.add(tf.layers.dense({units:48, activation:'relu'}));
      m.add(tf.layers.dropout({rate:0.3}));
      m.add(tf.layers.dense({units:nCls, activation:'softmax'}));
    }else{
      m.add(tf.layers.flatten({inputShape:[T, FEATS]}));
      m.add(tf.layers.dense({units:96, activation:'relu'}));
      m.add(tf.layers.dropout({rate:0.3}));
      m.add(tf.layers.dense({units:48, activation:'relu'}));
      m.add(tf.layers.dense({units:nCls, activation:'softmax'}));
    }
    m.compile({optimizer:tf.train.adam(0.002), loss:'categoricalCrossentropy', metrics:['accuracy']});
    return m;
  }
  async function train(){
    const classes=classList();
    if(classes.length<2){ warn('Need at least 2 classes.'); return; }
    if(samples.length<classes.length*4){ warn('Record more samples (about 8+ per class).'); }
    const T=winSize();
    const X=[], y=[];
    samples.forEach(function(s){
      const base=resample(s.frames, T);
      const copies=s.label==='Rest'?2:4;
      for(let i=0;i<copies;i++){
        X.push(i===0?base:augment(base));
        y.push(classes.indexOf(s.label));
      }
    });
    norm=computeNorm(X);
    const Xn=X.map(function(w){ return applyNorm(w,norm); });
    const xs=tf.tensor3d(Xn);
    const ys=tf.oneHot(tf.tensor1d(y,'int32'), classes.length);
    if(model){ model.dispose(); }
    model=buildModel($('arch').value, classes.length, T);
    model.classes=classes;
    model.T=T;
    lossHist=[];
    setStatus('Training...','warn');
    log('Train '+$('arch').value+' on '+Xn.length+' windows, '+classes.length+' classes, T='+T);
    await model.fit(xs, ys, {
      epochs:Number($('epochs').value),
      batchSize:Math.min(16, Xn.length),
      validationSplit: Xn.length>=12 ? 0.2 : 0,
      shuffle:true,
      callbacks:{
        onEpochEnd:function(ep, logs){
          lossHist.push({loss:logs.loss, acc:logs.acc, val:logs.val_acc});
          $('accVal').textContent = logs.val_acc!=null ? (logs.val_acc*100).toFixed(1)+'%' : (logs.acc*100).toFixed(1)+'%';
          drawLoss();
        }
      }
    });
    xs.dispose(); ys.dispose();
    const last=lossHist[lossHist.length-1];
    setStatus('Model ready','ok');
    $('btnListen').disabled=false;
    $('expModel').disabled=false;
    log('Done. acc='+(((last.val!=null?last.val:last.acc)*100).toFixed(1))+'%');
  }
  let smooth=null;
  function classifyLive(){
    if(!model || !norm) return;
    const raw=takeWindow();
    if(!raw) return;
    const T=model.T;
    const win=applyNorm(resample(raw,T), norm);
    const t=tf.tensor3d([win]);
    const out=model.predict(t);
    const p=out.dataSync();
    t.dispose(); out.dispose();
    if(!smooth || smooth.length!==p.length) smooth=Array.from(p);
    else smooth=smooth.map(function(v,i){ return v*0.65 + p[i]*0.35; });
    let best=0;
    for(let i=1;i<smooth.length;i++) if(smooth[i]>smooth[best]) best=i;
    $('pred').textContent=model.classes[best];
    $('confBar').style.width=(smooth[best]*100).toFixed(0)+'%';
    const box=$('bars'); box.innerHTML='';
    model.classes.forEach(function(c,i){
      const row=document.createElement('div');
      row.className='bar';
      row.innerHTML='<span style="width:86px">'+c+'</span><div class="track"><i style="width:'+(smooth[i]*100).toFixed(0)+'%"></i></div><span>'+(smooth[i]*100).toFixed(0)+'%</span>';
      box.appendChild(row);
    });
  }
  function drawWave(){
    const c=$('wave'), ctx=c.getContext('2d');
    const w=c.width=c.clientWidth*2, h=c.height=180*2;
    ctx.clearRect(0,0,w,h);
    const slice=ring.slice(-winSize());
    if(slice.length<2) return;
    const ch=['ax','ay','az','gx','gy','gz'];
    const col=['#6ea8ff','#2dd4bf','#fbbf24','#fb7185','#c084fc','#94a3b8'];
    ch.forEach(function(k,ci){
      ctx.beginPath(); ctx.strokeStyle=col[ci]; ctx.lineWidth=2;
      slice.forEach(function(f,i){
        let v=f[k];
        if(k[0]==='g') v/=400;
        const x=i/(slice.length-1)*w;
        const y=h/2 - v*(h*0.28);
        if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
      });
      ctx.stroke();
    });
  }
  function drawLoss(){
    const c=$('loss'), ctx=c.getContext('2d');
    const w=c.width=c.clientWidth*2, h=c.height=110*2;
    ctx.clearRect(0,0,w,h);
    if(!lossHist.length) return;
    ctx.beginPath(); ctx.strokeStyle='#6ea8ff'; ctx.lineWidth=3;
    lossHist.forEach(function(p,i){
      const x=i/(Math.max(1,lossHist.length-1))*w;
      const y=h-10 - Math.min(1,p.loss)*(h-20);
      if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
    });
    ctx.stroke();
  }
  function exportData(){
    const blob=new Blob([JSON.stringify({labels:labels,samples:samples,exported:new Date().toISOString()},null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='sensate-gestures.json';
    a.click();
  }
  function importData(file){
    const r=new FileReader();
    r.onload=function(){
      try{
        const d=JSON.parse(r.result);
        if(Array.isArray(d.labels)) labels=d.labels;
        if(Array.isArray(d.samples)) samples=d.samples;
        saveStore(); log('Imported '+samples.length+' samples');
      }catch(e){ warn('Bad JSON: '+e.message); }
    };
    r.readAsText(file);
  }
  async function exportModel(){
    if(!model) return;
    const json={classes:model.classes, T:model.T, arch:$('arch').value, norm:norm, note:'Import dataset and retrain to restore weights.'};
    const blob=new Blob([JSON.stringify(json,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='sensate-model-meta.json';
    a.click();
    try{ await model.save('downloads://sensate-gesture-model'); }catch(e){ log('Weight download: '+e.message); }
  }
  $('btnConnect').onclick=connect;
  $('btnDisc').onclick=disconnect;
  $('btnZero').onclick=function(){ zero={roll:latest.roll,pitch:latest.pitch,yaw:latest.yaw}; log('Zero pose captured'); };
  $('btnDemo').onclick=startDemo;
  $('btnStopDemo').onclick=function(){ stopDemo(); setStatus('Demo stopped'); };
  $('addLabel').onclick=function(){
    const n=$('newLabel').value.trim();
    if(!n) return;
    if(labels.indexOf(n)<0) labels.push(n);
    activeLabel=n; $('newLabel').value=''; saveStore();
  };
  $('btnRec').onclick=recordOne;
  $('btnBurst').onclick=recordBurst;
  $('btnTrain').onclick=function(){ train().catch(function(e){ warn(e.message); log(e.stack||e.message); }); };
  $('btnListen').onclick=function(){ listening=true; $('btnListen').disabled=true; $('btnListenOff').disabled=false; setStatus('Live classify','ok'); };
  $('btnListenOff').onclick=function(){ listening=false; $('btnListen').disabled=false; $('btnListenOff').disabled=true; };
  $('expData').onclick=exportData;
  $('impData').onclick=function(){ $('fileIn').click(); };
  $('fileIn').onchange=function(e){ if(e.target.files[0]) importData(e.target.files[0]); };
  $('expModel').onclick=exportModel;
  $('clrAll').onclick=function(){
    if(!confirm('Delete all samples and the model?')) return;
    samples=[]; model=null; norm=null; listening=false; saveStore();
    $('pred').textContent='\u2014'; $('accVal').textContent='\u2014';
  };
  loadStore(); renderLabels(); renderSamples();
  if(!navigator.bluetooth){
    setStatus('No Web Bluetooth','warn');
    warn('This browser cannot talk to WT901BLE. Use Android/desktop Chrome, or Demo IMU to train the net.');
  }
  log('Sensate gesture studio ready. TensorFlow.js '+(typeof tf!=='undefined'?tf.version.tfjs:'missing'));
})();
