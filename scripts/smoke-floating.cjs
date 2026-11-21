const { pause, until, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');
const { app, BrowserWindow, screen, Tray, Menu, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const interactive = process.argv.includes('--interactive');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-floating-profile-'));
const report = path.join(os.tmpdir(), interactive ? 'MathPad-floating-desktop.log' : 'MathPad-floating-smoke.log');
fs.writeFileSync(report, 'Math Pad floating button verification\n');
const log = createLogger(report);
app.setName('MathPad floating verification'); app.setPath('userData', profile);
let trayMenu, probe, panel, sampled, panelShows = 0, panelFocuses = 0;
const originalMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function(menu) { trayMenu=menu; return originalMenu.call(this,menu); };
const guard=setTimeout(()=>{log('FAIL overall timeout');app.exit(1);}, interactive?1200000:120000);
app.on('browser-window-created',(_,win)=>{
  if(win.getTitle()!=='Math Pad · 函数面板')return;
  panel=win;
  win.on('show',()=>panelShows++);
  win.on('focus',()=>panelFocuses++);
  prepareOfflineWindow(win);
  win.webContents.once('did-finish-load',()=>start().catch(async error=>{
    log('FAIL',error.stack);clearTimeout(guard);
    try {if(panel.isVisible()){const shot=await Promise.race([panel.webContents.capturePage(),pause(1000)]);if(shot)fs.writeFileSync(path.join(os.tmpdir(),'MathPad-floating-failure.png'),shot.toPNG());}}catch{}
    app.exit(1);
  }));
});
const ballWindow=()=>BrowserWindow.getAllWindows().find(win=>win.getTitle()==='Math Pad · 悬浮球');
async function start(){
  await until(()=>panel.webContents.executeJavaScript("document.querySelector('#graph-state').dataset.state==='ready'"),'Graph did not load',60000);
  await until(()=>ballWindow()?.isVisible()&&!ballWindow().webContents.isLoadingMainFrame(),'Floating ball did not load');
  const ball=ballWindow();
  assert.equal(panel.isVisible(),false,'Cold startup must keep the main panel hidden');
  assert.equal(panel.isAlwaysOnTop(),false);
  assert.equal(panelShows,0,'The main panel must never flash on startup');
  assert.equal(panelFocuses,0,'Cold startup must not focus the main panel');
  const initial=ball.getContentBounds();
  const initialArea=screen.getDisplayNearestPoint({x:initial.x+24,y:initial.y+24}).workArea;
  assert.equal(initial.x,initialArea.x);
  assert.equal(initial.y,Math.round(initialArea.y+(initialArea.height-48)/2));
  log('QUIET STARTUP: MAIN PANEL NEVER SHOWN OR FOCUSED; BALL AT LEFT CENTER',initial);
  assert.equal(ball.isFocusable(),false);assert.equal(ball.isAlwaysOnTop(),true);
  assert.equal(ball.getContentBounds().width,48);assert.equal(ball.getContentBounds().height,48);
  assert.deepEqual(await ball.webContents.executeJavaScript('[window.innerWidth,window.innerHeight]'),[48,48]);
  assert.equal(await ball.webContents.executeJavaScript("typeof window.mathPadFloating?.down"),'function');
  assert.equal(await panel.webContents.executeJavaScript("typeof window.mathPadFloating"),'undefined');
  log('VISIBLE 48 DIP BUTTON; TOPMOST, NON-FOCUSABLE, LOCAL SANDBOXED PRELOAD', {pid:process.pid,profile});
  if(interactive){
    log('INTERACTIVE READY');
    setInterval(()=>{
      const floating=ballWindow();
      const state=JSON.stringify({panelVisible:!panel.isDestroyed()&&panel.isVisible(),panelFocused:!panel.isDestroyed()&&panel.isFocused(),ball:!!floating,ballFocused:floating?.isFocused(),ballTopmost:floating?.isAlwaysOnTop(),bounds:floating?.getContentBounds()});
      if(state!==sampled){sampled=state;log('STATE',state);}
    },200).unref();
    return;
  }
  panel.hide();
  probe=new BrowserWindow({show:false,width:450,height:300,title:'Math Pad input focus probe'});
  await probe.loadURL('data:text/html,<title>Math Pad input focus probe</title><h1>Another active window</h1>');
  probe.show();probe.focus();await until(()=>probe.isFocused(),'Probe did not take focus');
  const originalCursor=screen.getCursorScreenPoint;
  let cursor=originalCursor();screen.getCursorScreenPoint=()=>cursor;
  try{
    const attributes = () => ball.webContents.executeJavaScript("({...document.querySelector('#floating-ball').dataset})");
    async function expandBall(){
      const before=ball.getContentBounds(), state=await attributes();
      cursor={x:before.x+(state.edge==='left'?8:state.edge==='right'?40:24),y:before.y+(state.edge==='top'?8:state.edge==='bottom'?40:24)};
      await until(async()=>Number((await attributes()).offset)===0,'Hover did not expand the floating ball');
    }
    async function sendPointer(type, x, y) {
      const channel = type === 'mouseDown' ? 'floating:down' : 'floating:up';
      let received = false;
      const receive = event => { if (event.sender === ball.webContents) received = true; };
      ipcMain.on(channel, receive);
      try {
        ball.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
        await until(() => received, 'Floating ball did not receive ' + type, 5000);
      } finally { ipcMain.removeListener(channel, receive); }
    }
    async function dragTo(target){
      await expandBall();
      const before=ball.getContentBounds();cursor={x:before.x+24,y:before.y+24};
      await sendPointer('mouseDown', 24, 24);
      cursor={x:target.x+24,y:target.y+24};
      await sendPointer('mouseUp', 24, 24);
      return ball.getContentBounds();
    }
    const area=screen.getDisplayNearestPoint({x:ball.getContentBounds().x+24,y:ball.getContentBounds().y+24}).workArea;
    const center={x:Math.round(area.x+area.width*.42),y:Math.round(area.y+area.height*.42)};
    let result=await dragTo(center);
    assert.ok(Math.abs(result.x-center.x)<=1&&Math.abs(result.y-center.y)<=1,`Free drag position incorrect: ${JSON.stringify({ result, center })}`);
    assert.equal(panel.isVisible(),false,'Dragging must not open the panel');
    assert.equal(probe.isFocused(),true,`Dragging must preserve probe focus: ${JSON.stringify(BrowserWindow.getAllWindows().map(win=>({title:win.getTitle(),focused:win.isFocused(),focusable:win.isFocusable()})))}`);
    cursor={x:area.x+area.width/2,y:area.y+area.height/2};await pause(1100);
    assert.equal(Number((await attributes()).offset),0,'A freely placed button must stay expanded');
    for(const [target,expected,edge] of [
      [{x:area.x+12,y:center.y},{x:area.x,y:center.y},'left'],
      [{x:area.x+area.width-60,y:center.y},{x:area.x+area.width-48,y:center.y},'right'],
      [{x:center.x,y:area.y+12},{x:center.x,y:area.y},'top'],
      [{x:center.x,y:area.y+area.height-60},{x:center.x,y:area.y+area.height-48},'bottom'],
    ]){
      result=await dragTo(target);assert.ok(Math.abs(result.x-expected.x)<=1&&Math.abs(result.y-expected.y)<=1,'Edge snap incorrect');
      cursor={x:area.x+area.width/2,y:area.y+area.height/2};
      await until(async()=>(await attributes()).retracted==='true','Docked button did not retract on '+edge);
      assert.equal((await attributes()).edge,edge);
      assert.deepEqual(ball.getContentBounds(),result,'Retraction must preserve its saved anchor');
      assert.equal(probe.isFocused(),true);assert.equal(ball.isFocused(),false);
      if(edge==='right')fs.writeFileSync(path.join(os.tmpdir(),'MathPad-floating-edge-hidden.png'),(await ball.webContents.capturePage()).toPNG());
      await expandBall();
    }
    log('FREE DRAG STAYS EXPANDED; FOUR EDGES RETRACT AND RESTORE ON HOVER WITHOUT FOCUS STEAL');
    await dragTo({x:area.x+area.width-60,y:center.y});
    cursor={x:area.x+area.width/2,y:area.y+area.height/2};
    const popup=Menu.prototype.popup;let closeMenu;
    Menu.prototype.popup=function(options){closeMenu=options.callback;};
    try{
      await ball.webContents.executeJavaScript('window.mathPadFloating.menu()');
      await until(()=>!!closeMenu,'Context menu did not open');await pause(1100);
      assert.equal(Number((await attributes()).offset),0,'An open menu must keep the button expanded');
      closeMenu();await until(async()=>(await attributes()).retracted==='true','Button did not resume retraction after closing menu');
    }finally{Menu.prototype.popup=popup;}
    log('CONTEXT MENU SUSPENDS RETRACTION');
    const dragOrigin=ball.getContentBounds();
    cursor={x:dragOrigin.x+40,y:dragOrigin.y+24};
    await sendPointer('mouseDown', 40, 24);
    cursor={x:center.x+40,y:center.y+24};
    await sendPointer('mouseUp', 40, 24);
    assert.ok(Math.abs(ball.getContentBounds().x-center.x)<=1,'Dragging the retracted strip did not move the button');
    assert.equal(panel.isVisible(),false);assert.equal(probe.isFocused(),true);
    await dragTo({x:area.x+area.width-60,y:center.y});cursor={x:area.x+area.width/2,y:area.y+area.height/2};
    await until(async()=>(await attributes()).retracted==='true','Strip did not retract before click');
    const clickOrigin=ball.getContentBounds();cursor={x:clickOrigin.x+40,y:clickOrigin.y+24};
    await sendPointer('mouseDown', 40, 24);
    await sendPointer('mouseUp', 40, 24);
    await until(()=>panel.isVisible()&&panel.isFocused(),'Clicking the retracted strip did not reveal the panel');
    panel.hide();probe.show();probe.focus();await until(()=>probe.isFocused(),'Probe did not recover focus');
    log('RETRACTED STRIP CAN BE DRAGGED AND CLICKED DIRECTLY');
    await expandBall();
    const before=ball.getContentBounds();
    ipcMain.emit('floating:down',{sender:panel.webContents});cursor={x:100,y:100};await pause(80);
    ipcMain.emit('floating:up',{sender:panel.webContents});assert.deepEqual(ball.getContentBounds(),before);
    log('IPC IGNORES OTHER WINDOWS');
    cursor={x:before.x+24,y:before.y+24};
    await ball.webContents.executeJavaScript("document.querySelector('#floating-ball').click()");
    await until(()=>panel.isVisible()&&panel.isFocused(),'Click did not reveal the main panel');
    assert.equal(ball.isFocused(),false);assert.equal(ball.isAlwaysOnTop(),true);
    panel.close();assert.equal(panel.isVisible(),false);assert.equal(ball.isVisible(),true);
    log('CLICK REVEALS SAME PANEL; CLOSING PANEL KEEPS BALL');
    let item=trayMenu.getMenuItemById('show-floating');item.click();await pause(80);
    assert.equal(ball.isVisible(),false);
    let saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));assert.equal(saved.showBall,false);
    item=trayMenu.getMenuItemById('show-floating');item.click();
    await until(()=>ball.isVisible(),'Tray did not restore ball');
    saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));assert.equal(saved.showBall,true);
    assert.deepEqual(ball.getContentBounds(),before);
    trayMenu.getMenuItemById('reset-floating').click();
    const resetBounds=ball.getContentBounds();
    const resetArea=screen.getDisplayNearestPoint({x:resetBounds.x+24,y:resetBounds.y+24}).workArea;
    assert.equal(resetBounds.x,resetArea.x);
    assert.equal(resetBounds.y,Math.round(resetArea.y+(resetArea.height-48)/2));
    await expandBall();
    fs.writeFileSync(path.join(os.tmpdir(),'MathPad-floating-button.png'),(await ball.webContents.capturePage()).toPNG());
    const restoredBounds=ball.getContentBounds();ball.destroy();
    item=trayMenu.getMenuItemById('show-floating');item.click();
    await until(()=>ballWindow()?.isVisible(),'Destroyed ball did not recover');
    assert.deepEqual(ballWindow().getContentBounds(),restoredBounds);
    assert.equal(BrowserWindow.getAllWindows().filter(win=>win.getTitle()==='Math Pad · 悬浮球').length,1);
    log('TRAY SHOW/HIDE, POSITION PERSISTENCE, RESET AND WINDOW RECOVERY');
  }finally{screen.getCursorScreenPoint=originalCursor;}
  probe.destroy();probe=undefined;clearTimeout(guard);log('ALL CHECKS PASSED');
  trayMenu.getMenuItemById('quit-mathpad').click();
}
loadApp();
