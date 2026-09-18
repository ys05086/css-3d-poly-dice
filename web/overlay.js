"use strict";
/* 주사위 오버레이. 창 껍데기는 overlay/main.py 가, 주사위는 dice.js 가 맡는다.
   여기는 그 사이 ─ 무엇을 굴릴지, 결과를 어떻게 읽을지, 무엇을 남길지.

   굴리는 것도 판정도 코드가 한다. dice.js 는 결과를 받아 보여줄 뿐이다.

   화면은 알약 하나다. 설정을 열면 창이 늘어나고, 닫으면 다시 줄어든다 ─
   평소에는 굴리는 데 필요한 것만 화면에 있어야 한다. */

const $ = (id) => document.getElementById(id);
const py = () => window.pywebview && window.pywebview.api;

/* dice.js 도 전역에 esc 를 둔다. 둘 다 평범한 스크립트라 전역을 공유하므로
   같은 이름을 쓰면 재선언으로 이 파일이 통째로 죽는다. */
const safe = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── 설정 ─────────────────────────────────────────────── */

const DEFAULTS = {
  sides: 20,          // 굴릴 주사위 하나. d100 이면 알이 둘로 나온다.
  extra: [],          // 수정치 주사위. 여기 든 것들도 같이 굴려 합에 더한다.
  label: "",
  target: 0,
  mod: 0,
  crit: "nat",        // 대성공·대실패를 무엇이 정하는가. judge() 를 본다.
  floor: 1,           // 합의 하한. null 이면 없음.
  material: "mat-onyx",
  size: 42,
  alpha: 94,
  onTop: true,
};
const MATERIALS = [
  ["mat-onyx", "흑요석"], ["mat-marble", "대리석"], ["mat-steel", "강철"],
  ["mat-ivory", "상아"], ["mat-neon", "네온"], ["mat-oak", "참나무"],
];
const PICKABLE = [4, 6, 8, 10, 12, 20, 100];
// 숫자 판정에서 대성공·대실패가 갈리는 차이. judge() 를 본다.
const CRIT_EDGE = 10;
const CRIT_MODES = [
  ["nat", "눈금", "주사위 눈이 정한다 — d20 의 20 과 1"],
  ["num", "숫자", `목표와 ${CRIT_EDGE} 이상 벌어지면`],
];
const LOG_MAX = 300;

/* 창 여백. 위아래를 크게 잡는 이유는 하나다 ─ 주사위가 튀어 오를 자리.
   dice.js 는 최대 34px 까지 던지므로 그만큼은 비워 둬야 잘리지 않는다.
   이 자리는 눈에도 안 보이고(main.py 의 clear_background) 클릭도 통과한다
   ─ fitWindow 가 알약이 실제로 있는 사각형을 함께 넘겨주기 때문이다. */
const MARGIN_X = 10;
const MARGIN_Y = 34;
const PANEL_H = 460;
// 설정 패널은 알약이 넓어져도 따라 늘어나지 않는다. overlay.css 와 같은 값.
const PANEL_W = 360;
const MIN_W = 180;

let cfg = { ...DEFAULTS };
let log = [];

function load() {
  try {
    cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("dice.cfg") || "{}") };
    log = JSON.parse(localStorage.getItem("dice.log") || "[]");
  } catch (_) {
    cfg = { ...DEFAULTS };        // 저장소가 막혀도 굴리는 건 굴러가야 한다
    log = [];
  }
}
function save() {
  try {
    localStorage.setItem("dice.cfg", JSON.stringify(cfg));
    localStorage.setItem("dice.log", JSON.stringify(log.slice(0, LOG_MAX)));
  } catch (_) { /* 못 써도 이번 판은 굴러간다 */ }
}

/* ── 굴리기 ───────────────────────────────────────────── */

const pick = (n) => 1 + Math.floor(Math.random() * n);

/* 목표 표기. 어느 쪽이 좋은지 부등호로 못박는다. */
function goalText(sides, target) {
  if (!target) return "";
  return sides === 100 ? `≤ ${target}%` : `≥ DC ${target}`;
}

/* 판정. 주사위마다 '좋은 방향' 이 다르다.

   d100 은 백분율 굴림이라 **낮을수록** 좋다. 목표가 곧 성공률이어서
   '기술 55%' 면 55 이하가 성공이다(크툴루의 부름이 그렇다).
   나머지는 d20+수정치가 DC 를 넘어야 하니 **높을수록** 좋다.

   헷갈리기 쉬워서 화면에도 부등호를 함께 적는다. 목표가 없으면
   판정하지 않고 눈만 보여준다.

   대성공·대실패를 무엇이 정하는가는 판마다 다르므로 설정으로 뺐다.

     눈금 ─ 주사위 눈이 정한다. d20 의 20 과 1, d100 의 05 이하와 96 이상.
            수정치가 아무리 커도 눈이 1이면 대실패다. D&D 의 공격 굴림이
            그렇다(자연 1은 무조건 빗나간다). 목표가 없어도 뜬다.
     숫자 ─ 합이 목표에서 얼마나 떨어졌는지가 정한다. CRIT_EDGE 만큼
            넘기면 대성공, 그만큼 모자라면 대실패. 패스파인더 2판 식이다.
            눈 하나로 판이 뒤집히지 않는 대신 목표가 있어야 한다. */
function judge(sides, value, total, target, mode) {
  if (mode === "nat") {
    if (sides === 20 && value === 20) return { kind: "crit", text: "대성공" };
    if (sides === 20 && value === 1) return { kind: "fumble", text: "대실패" };
    if (sides === 100 && value <= 5) return { kind: "crit", text: "대성공" };
    if (sides === 100 && value >= 96) return { kind: "fumble", text: "대실패" };
  }
  if (!target) return null;
  // 목표를 얼마나 넘겼는가. d100 은 낮을수록 좋으니 부등호가 뒤집힌다.
  const by = sides === 100 ? target - value : total - target;
  if (mode === "num") {
    if (by >= CRIT_EDGE) return { kind: "crit", text: "대성공" };
    if (by <= -CRIT_EDGE) return { kind: "fumble", text: "대실패" };
  }
  return by >= 0 ? { kind: "ok", text: "성공" } : { kind: "fail", text: "실패" };
}

let rollTimer = null;

function roll() {
  const sides = cfg.sides;
  const value = pick(sides);
  // 수정치 주사위도 같이 굴린다. d100 은 백분율이라 더하지 않는다 ─
  // 55% 판정에 d6 을 얹으면 그건 더 이상 백분율이 아니다.
  const extras = sides === 100 ? [] : cfg.extra.map((n) => ({ sides: n, value: pick(n) }));
  const bonus = extras.reduce((a, e) => a + e.value, 0);
  const raw = sides === 100 ? value : value + bonus + cfg.mod;
  /* 하한은 눈에 거슬리는 음수를 가리는 것일 뿐, 규칙이 아니다.

     한때 판정도 올린 값으로 했는데 그게 틀렸다. 하한 1 에 DC 10 이면 합이
     목표에서 10 만큼 멀어질 수가 없어서, '숫자' 기준의 대실패가 영영 안
     떴다. 켜 둔 규칙이 조용히 멎은 셈이다.
     보이는 숫자와 판정이 어긋나는 건 감수한다 ─ 근거는 숫자 위에 올려놓으면
     나오고, 거기 원래 합이 그대로 적혀 있다.

     d100 은 백분율이라 손대지 않는다. 3% 굴림을 하한으로 올리면 그건 더 이상
     백분율이 아니다. */
  const capped = sides !== 100 && cfg.floor !== null && raw < cfg.floor;
  const total = capped ? cfg.floor : raw;
  const verdict = judge(sides, value, raw, cfg.target, cfg.crit);

  const pill = $("pill");
  pill.className = "pill rolling";
  clearTimeout(rollTimer);

  const tray = $("tray");
  tray.innerHTML = "";
  const o = { size: cfg.size, material: cfg.material };
  if (sides === 100) tray.append(...Dice.percentile(value, o));
  else tray.append(Dice.of(sides, value, o));
  // 수정치 주사위는 작게, 한 칸 띄워서. 주된 주사위와 헷갈리면 안 된다.
  for (const e of extras) {
    const die = Dice.of(e.sides, e.value, { size: Math.round(cfg.size * 0.68), material: cfg.material });
    die.classList.add("side");
    tray.append(die);
  }

  $("lb").textContent = cfg.label || "";
  $("val").textContent = total;
  /* 합이 어떻게 나왔는지는 숫자 위에 얹어 둔다.

     한때 괄호로 알약에 적었는데('-5 (1 - 6) / ≥ DC 10'), 수정치 주사위까지
     붙으면 알약이 감당이 안 되게 길어진다. 그렇다고 지우면 안 된다 ─
     대성공·대실패는 합이 아니라 눈금으로 가르므로(d20 의 20 과 1),
     '-5 대실패' 만 보이면 수정치 탓에 대실패가 난 것처럼 읽힌다.
     그래서 평소에는 값만 툭 던지고, 근거는 올려놓으면 나온다.

     제목 풍선을 쓰는 이유: 창이 알약 모양으로 오려져 있어서(main.py 의
     cut_to_shape) 화면 안에 그린 풍선은 알약 밖으로 나가는 순간 잘린다.
     제목 풍선은 운영체제가 제 창에 그리므로 잘리지 않는다. */
  // 부호는 join 이 붙인다. 여기서 '+' 를 또 붙이면 '14 + +10' 이 된다.
  const parts = [String(value), ...extras.map((e) => String(e.value))];
  if (cfg.mod) parts.push(String(cfg.mod));
  const note = (parts.length > 1 && sides !== 100)
    ? `${parts.join(" + ").replace(/\+ -/g, "- ")} = ${raw}` +
      (capped ? ` → 하한 ${total}` : "")       // 하한이 물었으면 거기도 밝힌다
    : "";
  $("goal").textContent = cfg.target ? "/ " + goalText(sides, cfg.target) : "";
  $("verdict").textContent = verdict ? verdict.text : "";
  // 굴리는 동안은 근거도 없다. 올려놓으면 보이는 것도 미리 새는 것이다.
  $("val").title = "";
  fitWindow();

  const entry = {
    at: Date.now(), sides, roll: value, total,
    extra: extras.map((e) => e.value),
    label: cfg.label, target: cfg.target,
    kind: verdict ? verdict.kind : "", text: verdict ? verdict.text : "",
  };

  /* 주사위가 멈춘 뒤에야 결과가 뜬다. 미리 새면 굴리는 의미가 없다.

     기록도 여기서 남긴다. 누르는 순간 남기면, 멈추기 전에 또 누를 때마다
     화면에는 안 뜬 굴림이 기록에만 쌓인다 ─ 위의 clearTimeout 이 앞선
     굴림의 공개를 취소하기 때문이다. 결과를 못 본 굴림은 없던 일이어야
     한다. 공중에서 주사위를 다시 집은 셈이다. */
  const until = Math.max(1000, ...[...tray.children].map((d) => Number(d.dataset.ms) || 0));
  rollTimer = setTimeout(() => {
    pill.className = "pill" + (verdict ? " " + verdict.kind : "");
    $("val").title = note;
    log.unshift(entry);
    log = log.slice(0, LOG_MAX);
    save();
    if (!$("panel").hidden && !$("p-log").hidden) renderLog();   // 보고 있으면 바로
  }, until);
}

/* ── 그리기 ───────────────────────────────────────────── */

/* 굴리기 전 모습. 눈은 보여주지 않는다 — 결과를 미리 흘리면 안 된다. */
function renderIdle() {
  const tray = $("tray");
  tray.innerHTML = "";
  const o = { size: cfg.size, material: cfg.material };
  if (cfg.sides === 100) {
    tray.append(Dice.d10("00", { ...o, band: "tens" }), Dice.d10("0", o));
  } else {
    tray.append(Dice.of(cfg.sides, cfg.sides, o));
  }
  if (cfg.sides !== 100) {
    for (const n of cfg.extra) {
      const die = Dice.of(n, n, { size: Math.round(cfg.size * 0.68), material: cfg.material });
      die.classList.add("side");
      tray.append(die);
    }
  }
  $("pill").className = "pill idle";
  $("lb").textContent = cfg.label || "";
  $("val").textContent = "—";
  $("goal").textContent = goalText(cfg.sides, cfg.target)
    ? "/ " + goalText(cfg.sides, cfg.target) : "";
  $("verdict").textContent = "";
  $("val").title = "";
  fitWindow();
}

function renderPicks() {
  const box = $("pick-dice");
  box.innerHTML = "";
  for (const sides of PICKABLE) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `d${sides}`;
    b.className = cfg.sides === sides ? "on" : "";
    b.onclick = () => { cfg.sides = sides; save(); renderPicks(); renderIdle(); };
    box.append(b);
  }
  const ex = $("pick-extra");
  ex.innerHTML = "";
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    const b = document.createElement("button");
    b.type = "button";
    const n = cfg.extra.filter((x) => x === sides).length;
    b.textContent = n > 1 ? `${n}d${sides}` : `d${sides}`;
    b.className = n ? "on" : "";
    b.title = "누르면 추가, 오른쪽 단추로 빼기";
    b.onclick = () => { if (cfg.extra.length < 6) cfg.extra.push(sides); after(); };
    b.oncontextmenu = (e) => {
      e.preventDefault();
      const i = cfg.extra.lastIndexOf(sides);
      if (i >= 0) cfg.extra.splice(i, 1);
      after();
    };
    ex.append(b);
  }
  const after = () => { save(); renderPicks(); renderIdle(); };

  const crit = $("pick-crit");
  crit.innerHTML = "";
  for (const [key, name, tip] of CRIT_MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.title = tip;
    b.className = cfg.crit === key ? "on" : "";
    b.onclick = () => { cfg.crit = key; save(); renderPicks(); renderIdle(); };
    crit.append(b);
  }
  // '숫자' 인데 목표가 없으면 아무것도 안 뜬다. 고장처럼 보이므로 말해 준다.
  $("crit-warn").hidden = !(cfg.crit === "num" && !cfg.target);

  const mat = $("pick-mat");
  mat.innerHTML = "";
  for (const [key, name] of MATERIALS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.className = cfg.material === key ? "on" : "";
    b.onclick = () => { cfg.material = key; save(); renderPicks(); renderIdle(); };
    mat.append(b);
  }
}

function renderLog() {
  const box = $("log");
  if (!log.length) {
    box.innerHTML = '<div class="log-empty">아직 굴린 적이 없습니다.</div>';
    return;
  }
  box.innerHTML = log.slice(0, 80).map((r) => {
    const t = new Date(r.at);
    const clock = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    const goal = r.target ? " / " + goalText(r.sides, r.target) : "";
    const tone = r.kind === "crit" || r.kind === "ok" ? "ok"
               : r.kind === "fumble" || r.kind === "fail" ? "fail" : "";
    return `<div class="log-row ${tone}"><span class="t">${clock}</span>` +
           `<span class="lb">${safe(r.label || "d" + r.sides)}</span>` +
           `<span class="n">${r.total}</span><span class="t">${goal}</span>` +
           (r.text ? `<span class="v">${r.text}</span>` : "") + `</div>`;
  }).join("");
}

function applyLook() {
  document.documentElement.style.setProperty("--alpha", (cfg.alpha / 100).toFixed(2));
  $("f-size").value = cfg.size;   $("n-size").textContent = cfg.size;
  $("f-alpha").value = cfg.alpha; $("n-alpha").textContent = cfg.alpha + "%";
  $("f-label").value = cfg.label;
  $("f-target").value = cfg.target || "";
  $("f-mod").value = cfg.mod;
  $("f-floor").value = cfg.floor === null ? "" : cfg.floor;
  $("f-top").checked = cfg.onTop;
}

/* 이번 설정에서 나올 수 있는 가장 긴 읽을거리.

   폭이 결과를 알려주면 안 된다. 결과 글자는 굴리는 동안 opacity 0 으로
   숨기지만 자리는 그대로 차지한다 ─ 숨긴 게 아니라 안 보이게만 한 것이다.
   그래서 '대실패' 가 뜰 판은 주사위가 멈추기도 전에 알약이 길어져 있었고,
   길이만 보고도 무엇이 뜰지 알 수 있었다. 눈을 가려 놓고 폭으로 흘린 셈이다.

   그래서 폭은 실제로 나온 눈이 아니라 '나올 수 있었던 것 중 가장 긴 것' 으로
   잡는다. 어떤 눈이 나오든 알약은 같은 길이다. 굴리기 전과도 같다. */
function widestRead(sides) {
  const goal = cfg.target ? "/ " + goalText(sides, cfg.target) : "";
  // 대성공·대실패가 가능한 판이면 세 글자만큼 자리를 잡아 둔다.
  const big = (cfg.crit === "nat" && (sides === 20 || sides === 100))
           || (cfg.crit === "num" && cfg.target);
  const verdict = big ? "대실패" : (cfg.target ? "실패" : "");
  if (sides === 100) return { val: "100", goal, verdict };

  // 합이 닿을 수 있는 양 끝. 자릿수는 가운데가 아니라 끝에서 가장 길다.
  const lo = 1 + cfg.extra.length + cfg.mod;          // 눈도 수정치 주사위도 최소
  const hi = sides + cfg.extra.reduce((a, n) => a + n, 0) + cfg.mod;
  const capped = cfg.floor !== null && lo < cfg.floor;
  const ends = [String(capped ? cfg.floor : lo), String(hi)];
  return { val: ends[1].length >= ends[0].length ? ends[1] : ends[0], goal, verdict };
}

/* 창을 내용에 맞춘다. 판정 이름이 길면 알약도 길어져야 하고, 짧으면
   빈 자리가 남으면 안 된다.
   다음 프레임에 재는 이유: 방금 바꾼 글자의 너비는 아직 반영되지 않았다.

   크기와 함께 창을 오려 낼 모양도 같이 보낸다. 창은 알약보다 넓다 ─
   주사위가 튀어 오를 자리 때문이다. 그 빈 자리가 창인 채로 남으면 밑에서
   하던 일을 가로막으므로, main.py 가 여기 적힌 자리만 남기고 잘라낸다.
   [왼쪽, 위, 오른쪽, 아래, 모서리반지름] 이고 창 안쪽 CSS 픽셀 기준이다.
   재지 않고 계산하는 이유: 창이 아직 새 크기가 아니라 패널을 재면 틀린다. */
function fitWindow() {
  requestAnimationFrame(() => {
    const pill = $("pill");
    const open = !$("panel").hidden;

    /* 결과가 폭으로 새지 않게, 잴 때만 '가장 긴 경우' 를 끼워 넣는다.
       그리고 잰 폭을 알약에 못박는다 ─ 창만 고정하면 소용이 없다.
       눈에 보이는 건 창이 아니라 알약이고, 알약은 제 내용만큼만 차지하므로
       창이 넓어도 캡슐은 결과에 따라 줄었다 늘었다 한다. */
    const slots = [$("val"), $("goal"), $("verdict")];
    const keep = slots.map((el) => el.textContent);
    const wide = widestRead(cfg.sides);
    slots[0].textContent = wide.val;
    slots[1].textContent = wide.goal;
    slots[2].textContent = wide.verdict;
    pill.style.width = "";                      // 잴 때는 내용만큼 부풀게 둔다
    const pw = Math.ceil(pill.offsetWidth);
    const ph = Math.ceil(pill.offsetHeight);
    slots.forEach((el, i) => { el.textContent = keep[i]; });
    pill.style.width = pw + "px";               // 이제 무엇이 뜨든 이 길이다
    const w = Math.max(open ? PANEL_W + MARGIN_X * 2 : 0, MIN_W, pw + MARGIN_X * 2);
    // 위쪽 여백은 언제나 남긴다(주사위가 튄다). 아래쪽은 패널이 대신 채운다.
    const h = MARGIN_Y + ph + (open ? 8 + PANEL_H + 10 : MARGIN_Y);

    // 오려 낼 자리는 그림보다 조금씩 넉넉하게 잡는다. 창을 자르는 선은
    // 계단이 지므로, 알약의 부드러운 끝이 아니라 아무것도 없는 자리를
    // 지나가야 눈에 띄지 않는다.
    const pad = 8;
    const tray = $("tray").getBoundingClientRect();
    const shape = [
      [MARGIN_X - pad, MARGIN_Y - pad, MARGIN_X + pw + pad, MARGIN_Y + ph + pad,
       ph / 2 + pad],
      // 주사위가 튀어 오르는 길. 여기는 잘라내면 안 된다.
      [Math.floor(tray.left) - 10, 0, Math.ceil(tray.right) + 10, MARGIN_Y + ph, 0],
    ];
    if (open) {
      // 창이 알약 때문에 더 넓어도 설정은 제 너비만큼만 오려 낸다.
      shape.push([MARGIN_X - 4, MARGIN_Y + ph + 8 - 4,
                  MARGIN_X + PANEL_W + 4, h - 10 + 4, 18]);
    }
    py()?.resize(w, h, shape);
  });
}

/* ── 창 끌기 ──────────────────────────────────────────────
   pywebview 의 드래그 영역(.pywebview-drag-region)은 쓰지 않는다. 그쪽은
   window 에 mousemove 를 걸어 두는데, 창이 손을 뒤따라오는 사이 커서가
   창 밖으로 한 번 나가면 이벤트가 끊겨 끌다 말고 놓친다. 포인터를 붙잡아
   두면(setPointerCapture) 커서가 어디로 가든 계속 받는다.

   그리고 알약은 통째로 손잡이다. 주사위를 잡고 끌 수도 있어야 하고,
   주사위를 톡 눌러 굴릴 수도 있어야 한다. 움직인 거리로 가른다. */
const DRAG_SLOP = 4;
let grab = null;

function onGrab(e) {
  if (e.button !== 0 || e.target.closest(".knob")) return;   // 설정 단추는 뺀다
  // 무엇을 눌렀는지는 지금 적어 둬야 한다. 포인터를 붙잡는 순간부터
  // 뒤따르는 이벤트의 target 은 붙잡은 쪽(알약)으로 바뀌어서, 나중에
  // 물어보면 주사위를 눌렀는지 알 길이 없다.
  grab = { id: e.pointerId, from: e.target, ox: e.clientX, oy: e.clientY,
           sx: e.screenX, sy: e.screenY, moved: false, at: null, frame: 0 };
  try { $("pill").setPointerCapture(e.pointerId); } catch (_) { /* 붙잡지 못해도 끈다 */ }
}

function onHaul(e) {
  if (!grab || e.pointerId !== grab.id) return;
  if (!grab.moved) {
    if (Math.abs(e.screenX - grab.sx) < DRAG_SLOP &&
        Math.abs(e.screenY - grab.sy) < DRAG_SLOP) return;
    grab.moved = true;
  }
  // 잡은 자리가 손가락 밑에 그대로 있어야 한다: 창 왼쪽 = 커서 - 잡은 지점.
  grab.at = [Math.round(e.screenX - grab.ox), Math.round(e.screenY - grab.oy)];
  if (!grab.frame) {
    grab.frame = requestAnimationFrame(() => {
      if (!grab) return;
      grab.frame = 0;
      if (grab.at) py()?.move(grab.at[0], grab.at[1]);
    });
  }
}

function onDrop(e) {
  if (!grab || e.pointerId !== grab.id) return;
  const { moved, frame, id, from } = grab;
  if (frame) cancelAnimationFrame(frame);
  grab = null;
  try { $("pill").releasePointerCapture(id); } catch (_) { /* 이미 놓았다 */ }
  // 끌었으면 누른 게 아니다. 주사위를 잡고 옮겼다고 굴러가면 안 된다.
  if (!moved && from && from.closest(".tray")) roll();
}

/* 설정은 창을 늘려서 편다. 알약만 있을 때는 알약만 있어야 한다. */
function openPanel(on) {
  $("panel").hidden = !on;
  document.body.classList.toggle("open", on);
  if (on) { renderPicks(); renderLog(); applyLook(); }
  fitWindow();
}

/* ── 연결 ─────────────────────────────────────────────── */

function wire() {
  // 굴림은 onDrop 이 낸다 ─ 끌었는지 눌렀는지를 거기서만 알 수 있다.
  const pill = $("pill");
  pill.addEventListener("pointerdown", onGrab);
  pill.addEventListener("pointermove", onHaul);
  pill.addEventListener("pointerup", onDrop);
  pill.addEventListener("pointercancel", onDrop);

  $("btn-cfg").onclick = () => openPanel($("panel").hidden);
  $("btn-quit").onclick = () => py()?.quit();
  $("btn-clear").onclick = () => { log = []; save(); renderLog(); };

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      ["dice", "look", "log"].forEach((k) => ($(`p-${k}`).hidden = k !== tab.dataset.tab));
      if (tab.dataset.tab === "log") renderLog();
    };
  });

  $("f-label").oninput = (e) => { cfg.label = e.target.value.trim(); save(); renderIdle(); };
  $("f-target").oninput = (e) => {
    cfg.target = Number(e.target.value) || 0;
    save(); renderIdle();
    $("crit-warn").hidden = !(cfg.crit === "num" && !cfg.target);
  };
  $("f-mod").oninput = (e) => { cfg.mod = Number(e.target.value) || 0; save(); };
  // 비워 두면 하한 없음. 0 은 0 이지 '없음' 이 아니므로 Number(..)||0 을 쓰면 안 된다.
  $("f-floor").oninput = (e) => {
    const v = e.target.value.trim();
    cfg.floor = v === "" || Number.isNaN(Number(v)) ? null : Number(v);
    save();
  };
  $("f-size").oninput = (e) => {
    cfg.size = Number(e.target.value); applyLook(); renderIdle(); save();
  };
  $("f-alpha").oninput = (e) => { cfg.alpha = Number(e.target.value); applyLook(); save(); };
  $("f-top").onchange = (e) => { cfg.onTop = e.target.checked; py()?.on_top(cfg.onTop); save(); };

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "1" || e.key === " " || e.key === "Enter") { e.preventDefault(); roll(); }
    if (e.key === "2") { cfg.sides = cfg.sides === 100 ? 20 : 100; save(); renderIdle(); }
    if (e.key === "Escape") {
      if (!$("panel").hidden) openPanel(false);
      else py()?.hide();
    }
  });
}

load();
wire();
applyLook();
renderIdle();

/* 첫 맞춤은 다리가 놓인 뒤에 한다.

   renderIdle() 안의 fitWindow() 는 이 시점에 헛돈다 ─ window.pywebview 가
   아직 없어서 py() 가 undefined 이고, ?. 가 조용히 넘어간다. 그래서 창은
   pywebview 가 만들어 준 첫 크기(404x101) 그대로 남고, 알약은 168 너비인데
   창만 넓은 꼴이 된다. 굴리거나 설정을 열어야 비로소 맞춰졌다.
   pywebviewready 는 다리가 놓이는 순간 한 번 온다. */
if (py()) fitWindow();
else window.addEventListener("pywebviewready", fitWindow, { once: true });
