const { pause, until, createLogger } = require('./lib/smoke.cjs');
// Exercise the actual root EXE and packaged host with an isolated profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(process.env.MATHPAD_TEST_PORTABLE_ROOT || path.join(__dirname, '..'));
const focusCheck = process.env.MATHPAD_TEST_NO_FOCUS_CHECKS !== '1';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad launcher profile '));
const report = path.join(os.tmpdir(), 'MathPad-launcher-smoke.log');
fs.writeFileSync(report, 'Math Pad root EXE and packaged process checks\n');
const log = createLogger(report);
let socket, hostPid, pending=new Map(), sequence=0;
const alive = pid => { try { process.kill(pid,0); return true; } catch { return false; } };
function launch(extra=[]) {
  return new Promise((resolve,reject)=>{
    const environment={...process.env};
    if(process.env.MATHPAD_TEST_CLEAN_ENV==='1') {
      for(const name of Object.keys(environment))if(/^path$/i.test(name))delete environment[name];
      environment.PATH=[path.join(process.env.SystemRoot || 'C:\\Windows','System32'),process.env.SystemRoot || 'C:\\Windows'].join(path.delimiter);
      environment.ELECTRON_RUN_AS_NODE='1';environment.ELECTRON_NO_ASAR='1';
      environment.NODE_OPTIONS='--require=mathpad-must-not-use-global-node';environment.NODE_PATH=path.join(profile,'no-global-node-modules');
    }
    const flags=process.env.MATHPAD_TEST_DISABLE_GPU==='1'?['--disable-gpu']:[];
    const child=spawn(path.join(root,'MathPad.exe'),[`--user-data-dir=${profile}`,...flags,...extra],{cwd:os.tmpdir(),env:environment,windowsHide:true,stdio:'ignore'});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Launcher exit '+code)));
  });
}
function evaluate(expression) {
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Inspector evaluation timed out'));},15000);
    pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
}
async function connect(port) {
  let target;
  await until(async()=>{try {target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())[0];return !!target?.webSocketDebuggerUrl;}catch{return false;}},'Packaged host did not start inspector',60000);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const reply=JSON.parse(event.data);if(!reply.id)return;
    const waiter=pending.get(reply.id);if(!waiter)return;pending.delete(reply.id);
    if(reply.error||reply.result?.exceptionDetails)waiter.reject(new Error(JSON.stringify(reply.error||reply.result.exceptionDetails)));
    else waiter.resolve(reply.result.result.value);
  });
  socket.addEventListener('close',()=>{for(const waiter of pending.values())waiter.reject(new Error('Inspector closed'));pending.clear();});
  await until(()=>evaluate('typeof process.mainModule?.require === "function"'),'Packaged main module did not initialize',60000);
}
async function main() {
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  await launch([`--inspect=127.0.0.1:${port}`]);
  await connect(port);
  const electron='process.mainModule.require("electron")';
  const window=`${electron}.BrowserWindow.getAllWindows().find(win=>win.getTitle()==='Math Pad · 函数面板')`;
  const ball=`${electron}.BrowserWindow.getAllWindows().find(win=>win.getTitle()==='Math Pad · 悬浮球')`;
  const visible=`${window}.isVisible() && !${window}.isMinimized()${focusCheck ? ` && ${window}.isFocused()` : ''}`;
  const page=code=>evaluate(`${window}.webContents.executeJavaScript(${JSON.stringify(code)})`);
  async function quitAndCheck() {
    const processIds=await evaluate(`${electron}.app.getAppMetrics().map(item=>item.pid)`);
    await evaluate(`setTimeout(()=>${electron}.Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.label==='完全退出').click(),150);true`);
    socket.close();socket=undefined;
    await until(()=>!alive(hostPid),'Completely exiting left the main process running',15000);
    await until(()=>processIds.every(pid=>!alive(pid)),'Completely exiting left a renderer or GPU process running',15000);
  }
  hostPid=await evaluate('process.pid');
  assert.equal(await evaluate(`${electron}.app.getVersion()`),JSON.parse(fs.readFileSync(path.join(root,'portable-manifest.json'),'utf8')).version,'Root entry must launch the recorded application version');
  assert.equal(await evaluate(`${electron}.app.getPath('userData')`),profile,'Root launcher must preserve the profile argument including spaces');
  await until(async()=>await evaluate(`${electron}.BrowserWindow.getAllWindows().length===2`)&&await page("document.querySelector('#graph-state')?.dataset.state==='ready'"),'Packaged graph and floating ball did not load',60000);
  await until(()=>evaluate(`${ball}.isVisible() && !${ball}.webContents.isLoadingMainFrame()`),'Startup ball did not become visible');
  assert.equal(await evaluate(`${window}.isVisible()`),false);
  assert.equal(await evaluate(`${window}.isFocused()`),false);
  assert.equal(await evaluate(`${window}.isAlwaysOnTop()`),false);
  const startupPosition=await evaluate(`(()=>{const bounds=${ball}.getContentBounds();const area=${electron}.screen.getDisplayNearestPoint({x:bounds.x+24,y:bounds.y+24}).workArea;return {bounds,area};})()`);
  assert.equal(startupPosition.bounds.x,startupPosition.area.x);
  assert.equal(startupPosition.bounds.y,Math.round(startupPosition.area.y+(startupPosition.area.height-48)/2));
  await evaluate(`${ball}.webContents.executeJavaScript("document.querySelector('#floating-ball').click()")`);
  await until(()=>evaluate(visible),'Clicking startup ball did not open the workbench');
  log('ROOT EXE STARTS QUIETLY WITH LEFT-CENTER BALL; CLICK OPENS PRELOADED PANEL');
  await page("document.querySelector('#open-formula').click();document.querySelector('#mode-keyboard').click();document.querySelector('#formula-text').value='y=x^2+1';document.querySelector('#formula-text').dispatchEvent(new Event('input'));document.querySelector('#submit-formula').click()");
  await until(()=>page("!document.querySelector('#formula-dialog').open"),'Packaged input did not plot');
  const objects=await page('window.ggbApplet.getAllObjectNames()');
  for(const state of ['close','minimize','close']) {
    await evaluate(`${window}.${state}()`);
    await pause(180);
    if(state==='close')assert.equal(await evaluate(`${window}.isVisible()`),false);
    await launch();
    await until(()=>evaluate(visible),'Double-clicking root EXE did not restore '+state+' window');
    assert.equal(await evaluate('process.pid'),hostPid);
    assert.equal(await evaluate(`${electron}.BrowserWindow.getAllWindows().length`),2);
    assert.deepEqual(await page('window.ggbApplet.getAllObjectNames()'),objects);
  }
  log('ROOT EXE RESTORES HIDDEN/MINIMIZED PANEL; SAME PID, ONE PANEL, ONE BALL AND ORIGINAL CURVE');
  const savedPosition=await evaluate(`(()=>{const area=${electron}.screen.getPrimaryDisplay().workArea;const bounds={x:area.x+180,y:area.y+160,width:48,height:48};${ball}.setContentBounds(bounds);return ${ball}.getContentBounds();})()`);
  await quitAndCheck();
  await launch([`--inspect=127.0.0.1:${port}`]);await connect(port);hostPid=await evaluate('process.pid');
  await until(()=>evaluate(`${ball} && ${ball}.isVisible() && !${ball}.webContents.isLoadingMainFrame()`),'Floating ball did not restore after cold start',60000);
  assert.deepEqual(await evaluate(`${ball}.getContentBounds()`),savedPosition);
  assert.equal(await evaluate(`${ball}.isFocusable()`),false);
  assert.equal(await evaluate(`${window}.isVisible()`),false,'Cold restart must keep the workbench hidden');
  await evaluate(`${ball}.close()`);assert.equal(await evaluate(`${ball}.isVisible()`),false);
  await quitAndCheck();
  await launch([`--inspect=127.0.0.1:${port}`]);await connect(port);hostPid=await evaluate('process.pid');
  await until(()=>evaluate(`${ball} && !${ball}.webContents.isLoadingMainFrame()`),'Hidden ball did not load after cold start',60000);
  assert.equal(await evaluate(`${ball}.isVisible()`),false);
  assert.equal(await evaluate(`${window}.isVisible()`),false);
  assert.deepEqual(await evaluate(`${ball}.getContentBounds()`),savedPosition);
  log('COLD START RESTORES FLOATING POSITION AND HIDDEN PREFERENCE');
  await quitAndCheck();
  fs.writeFileSync(path.join(profile,'floating-window.json'),JSON.stringify({version:1,visible:true,displayId:1,xRatio:1,yRatio:.42}));
  await launch([`--inspect=127.0.0.1:${port}`]);await connect(port);hostPid=await evaluate('process.pid');
  await until(()=>evaluate(`${ball} && ${ball}.isVisible() && !${ball}.webContents.isLoadingMainFrame()`),'Legacy profile did not load',60000);
  assert.equal(await evaluate(`${window}.isVisible()`),false);
  const migrated=await evaluate(`(()=>{const bounds=${ball}.getContentBounds();const area=${electron}.screen.getDisplayNearestPoint({x:bounds.x+24,y:bounds.y+24}).workArea;return {bounds,area};})()`);
  assert.equal(migrated.bounds.x,migrated.area.x);
  assert.equal(migrated.bounds.y,Math.round(migrated.area.y+(migrated.area.height-48)/2));
  await quitAndCheck();
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'floating-window.json'),'utf8')).version,2);
  log('LEGACY RIGHT-EDGE POSITION MIGRATES TO LEFT CENTER ONCE');
  if(process.env.MATHPAD_TEST_CLEAN_ENV==='1')log('NO NODE ON PATH; DEVELOPER ELECTRON/NODE VARIABLES DO NOT AFFECT THE APP');
  if(!focusCheck)log('NATIVE FOCUS ASSERTIONS SKIPPED FOR NON-INTERACTIVE CI DESKTOP');
  log('NORMAL EXIT REMOVES MAIN, RENDERER AND GPU PROCESSES; ALL CHECKS PASSED');
}
main().then(()=>{console.log(fs.readFileSync(report,'utf8'));}).catch(async error=>{
  log('FAIL',error.stack);socket?.close();
  if(hostPid&&alive(hostPid))await new Promise(resolve=>spawn('taskkill',['/PID',String(hostPid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).once('exit',resolve));
  console.error(fs.readFileSync(report,'utf8'));process.exitCode=1;
});
