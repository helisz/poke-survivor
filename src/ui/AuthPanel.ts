import Phaser from 'phaser';
import { UI, TEXT } from './Theme';
import { RoundedPanel } from './RoundedPanel';
import { attachPressFeedback } from './Feedback';
import { Sfx } from '../systems/Sfx';
import {
  cloudEnabled, login, register, rememberUsername, rememberedUsername,
  type CloudSession,
} from '../data/cloud';

/** 4 位数字密码的输入框：用原生 input 覆盖，手机上才能唤起数字键盘 */
function makeInput(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  placeholder: string, opts: { password?: boolean; maxLength?: number; numeric?: boolean },
): { box: Phaser.GameObjects.DOMElement; el: HTMLInputElement; setError: (on: boolean) => void } {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `width:${w}px;height:${h}px;display:flex;align-items:center;`;

  const input = document.createElement('input');
  input.type = opts.password ? 'password' : 'text';
  input.placeholder = placeholder;
  input.maxLength = opts.maxLength ?? 12;
  if (opts.numeric) input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.style.cssText = [
    'width:100%', 'height:100%', 'box-sizing:border-box',
    'background:#0d1a24', 'border:1.5px solid #2c4a5e', 'border-radius:10px',
    'color:#ffffff', 'font-family:sans-serif', 'font-size:15px',
    'padding:0 14px', 'outline:none', 'text-align:center',
    opts.password ? 'letter-spacing:6px' : '',
  ].join(';');
  input.addEventListener('focus', () => { input.style.borderColor = '#c9a227'; });
  input.addEventListener('blur', () => { input.style.borderColor = '#2c4a5e'; });
  wrapper.appendChild(input);

  const box = scene.add.dom(x, y, wrapper).setDepth(2210);
  return {
    box, el: input,
    setError: (on: boolean) => { input.style.borderColor = on ? '#e05a4e' : '#2c4a5e'; },
  };
}

/**
 * 登录 / 注册面板。
 * 关闭时回调 onDone：成功登录传 session，取消传 null。
 */
export function openAuthPanel(
  scene: Phaser.Scene,
  onDone: (session: CloudSession | null) => void,
) {
  const { width, height } = scene.scale;

  // 清掉上一层（确认框 depth 2300 / 资料卡）留下的残留，避免两层叠在一起
  scene.children.list
    .filter((o) => {
      const d = (o as Phaser.GameObjects.Container).depth;
      return typeof d === 'number' && d >= 2300;
    })
    .forEach((o) => o.destroy());

  const root = scene.add.container(0, 0).setDepth(2200);

  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setInteractive();
  root.add(dim);

  // 先清掉上一次可能残留的表单（避免多个 input 叠在一起）
  const existing = (scene.game.domContainer.querySelectorAll('.ps-auth-form') as NodeListOf<HTMLElement>);
  existing.forEach((n) => n.remove());

  const pw = Math.min(width - 44, 320);
  const ph = 372;
  const cx = width / 2, cy = height / 2;

  const panel = new RoundedPanel(scene, cx, cy, pw, ph, 0x140f08, 0.99, { radius: 16 })
    .setStrokeStyle(1.5, UI.primaryStroke);
  root.add(panel);

  const top = cy - ph / 2;

  const title = scene.add.text(cx, top + 30, '登录', {
    fontFamily: 'sans-serif', fontSize: '20px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5);
  root.add(title);

  const sub = scene.add.text(cx, top + 56, '数据存在云端，换设备也能接着玩', {
    fontFamily: 'sans-serif', fontSize: '11px', color: '#7fa8c4',
  }).setOrigin(0.5);
  root.add(sub);

  // 两个 tab：登录 / 注册
  let mode: 'login' | 'register' = 'login';
  const tabY = top + 92;
  const tabW = 100, tabH = 30;
  const loginTab = new RoundedPanel(scene, cx - tabW / 2 - 4, tabY, tabW, tabH, UI.primary, 1, { radius: 8 })
    .setInteractive({ useHandCursor: true });
  const regTab = new RoundedPanel(scene, cx + tabW / 2 + 4, tabY, tabW, tabH, UI.secondary, 0.9, { radius: 8 })
    .setInteractive({ useHandCursor: true });
  root.add([loginTab, regTab]);

  const loginTabTxt = scene.add.text(cx - tabW / 2 - 4, tabY, '登录', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#041018', fontStyle: 'bold',
  }).setOrigin(0.5);
  const regTabTxt = scene.add.text(cx + tabW / 2 + 4, tabY, '注册', {
    fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5);
  root.add([loginTabTxt, regTabTxt]);

  const setMode = (m: 'login' | 'register') => {
    mode = m;
    const isLogin = m === 'login';
    loginTab.setFillStyle(isLogin ? UI.primary : UI.secondary, isLogin ? 1 : 0.9);
    regTab.setFillStyle(isLogin ? UI.secondary : UI.primary, isLogin ? 0.9 : 1);
    loginTabTxt.setColor(isLogin ? '#041018' : TEXT.gold);
    regTabTxt.setColor(isLogin ? TEXT.gold : '#041018');
    title.setText(isLogin ? '登录' : '注册');
    sub.setText(isLogin ? '数据存在云端，换设备也能接着玩' : '注册即登录，自动进入主页');
    confirmTxt.setText(isLogin ? '登 录' : '注 册');
    errText.setText('');
  };
  loginTab.on('pointerdown', () => { Sfx.click(); setMode('login'); });
  regTab.on('pointerdown', () => { Sfx.click(); setMode('register'); });

  // 用户名
  root.add(scene.add.text(cx - pw / 2 + 24, top + 128, '用户名', {
    fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
  }).setOrigin(0, 0.5));
  const nameInput = makeInput(scene, cx, top + 156, pw - 48, 40,
    '3-12 位字母数字', { maxLength: 12 });
  nameInput.el.value = rememberedUsername();
  root.add(nameInput.box);

  // 密码
  root.add(scene.add.text(cx - pw / 2 + 24, top + 196, '密码（4 位数字）', {
    fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
  }).setOrigin(0, 0.5));
  const pwInput = makeInput(scene, cx, top + 224, pw - 48, 40,
    '••••', { password: true, maxLength: 4, numeric: true });
  // 只允许数字
  pwInput.el.addEventListener('input', () => {
    pwInput.el.value = pwInput.el.value.replace(/\D/g, '').slice(0, 4);
  });
  root.add(pwInput.box);

  const errText = scene.add.text(cx, top + 258, '', {
    fontFamily: 'sans-serif', fontSize: '11px', color: '#e05a4e', align: 'center',
    wordWrap: { width: pw - 48 },
  }).setOrigin(0.5, 0);
  root.add(errText);

  // 确认按钮
  const btnY = top + 300;
  const confirm = new RoundedPanel(scene, cx, btnY, pw - 48, 46, UI.primary, 1, { radius: 12 })
    .setStrokeStyle(1.5, UI.primaryStroke).setInteractive({ useHandCursor: true });
  attachPressFeedback(confirm);
  root.add(confirm);
  const confirmTxt = scene.add.text(cx, btnY, '登 录', {
    fontFamily: 'sans-serif', fontSize: '16px', color: '#041018', fontStyle: 'bold',
  }).setOrigin(0.5);
  root.add(confirmTxt);

  const closeBtn = scene.add.text(cx, top + ph - 26, '取消', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#7fa8c4',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  root.add(closeBtn);

  let busy = false;
  const fail = (msg: string) => {
    errText.setText(msg);
    pwInput.setError(true);
    busy = false;
    confirmTxt.setText(mode === 'login' ? '登 录' : '注 册');
  };

  const finish = (s: CloudSession | null) => {
    nameInput.box.destroy();
    pwInput.box.destroy();
    root.destroy(true);
    onDone(s);
  };

  const submit = async () => {
    if (busy) return;
    errText.setText('');
    nameInput.setError(false);
    pwInput.setError(false);

    const name = nameInput.el.value.trim();
    const pass = pwInput.el.value;

    if (!/^[A-Za-z0-9_]{3,12}$/.test(name)) {
      errText.setText('用户名需 3-12 位字母、数字或下划线');
      nameInput.setError(true);
      return;
    }
    if (!/^\d{4}$/.test(pass)) {
      errText.setText('密码必须是 4 位数字');
      pwInput.setError(true);
      return;
    }

    busy = true;
    confirmTxt.setText('处理中…');

    const r = mode === 'login'
      ? await login(name, pass)
      : await register(name, pass);

    if (r.ok) {
      rememberUsername(r.data.username);
      Sfx.select();
      finish(r.data);
      return;
    }

    const msg = r.reason === 'not_found' ? '用户名不存在'
      : r.reason === 'bad_password' ? '密码不正确'
      : r.reason === 'exists' ? '这个用户名已经被注册了'
      : r.reason === 'bad_username' ? '用户名需 3-12 位字母、数字或下划线'
      : r.reason === 'disabled' ? '云端功能未配置'
      : '网络连接失败，请重试';
    fail(msg);
  };

  confirm.on('pointerdown', () => { void submit(); });
  closeBtn.on('pointerdown', () => { Sfx.click(); finish(null); });

  // 回车提交
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    if (e.key === 'Escape') { finish(null); }
  };
  pwInput.el.addEventListener('keydown', onKey);
  nameInput.el.addEventListener('keydown', onKey);

  if (!cloudEnabled) {
    errText.setText('云端功能未配置，暂时无法登录');
  }

  return root;
}
