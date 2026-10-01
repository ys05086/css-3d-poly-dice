"use strict";
/* 주사위 오버레이. 창은 overlay/main.py가, 주사위는 dice.js가 담당한다.
   이 파일은 그 사이에서 무엇을 굴릴지, 결과를 어떻게 판정할지, 무엇을
   기록할지를 정한다.

   굴리기와 판정은 모두 이 코드가 한다. dice.js는 결과를 받아 보여 주기만 한다.

   화면은 알약 하나다. 설정을 열면 창이 커지고, 닫으면 다시 작아진다.
   평소에는 굴리는 데 필요한 것만 화면에 있어야 한다. */

const $ = (id) => document.getElementById(id);
const py = () => window.pywebview && window.pywebview.api;

/* dice.js도 전역에 esc를 정의한다. 둘 다 일반 스크립트라 전역을 공유하므로
   같은 이름을 쓰면 재선언 오류로 이 파일 전체가 실행되지 않는다. */
const safe = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── 설정 ─────────────────────────────────────────────── */

const DEFAULTS = {
  sides: 20,          // 굴릴 주사위. d100이면 십면체 두 개가 나온다.
  extra: [],          // 수정치 주사위. 함께 굴려서 합계에 더한다.
  label: "",
  target: 0,
  mod: 0,
  crit: "nat",        // 대성공·대실패 판정 기준. judge() 참고.
  floor: 1,           // 합계의 하한. null이면 하한 없음.
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
// '목표 차이' 기준에서 대성공·대실패가 되는 차이. judge() 참고.
const CRIT_EDGE = 10;
const CRIT_MODES = [
  ["nat", "주사위 눈", "d20에서 20이면 대성공, 1이면 대실패"],
  ["num", "목표 차이", `합계가 목표와 ${CRIT_EDGE} 이상 차이 나면 대성공·대실패`],
];
const LOG_MAX = 300;

/* 창 여백. 위아래를 크게 잡는 이유는 주사위가 튀어 오를 공간 때문이다.
   dice.js는 최대 34px까지 띄우므로 그만큼 비워 둬야 잘리지 않는다.
   이 공간은 보이지도 않고(main.py의 clear_background) 클릭도 통과한다.
   fitWindow가 알약이 실제로 있는 영역을 함께 넘겨주기 때문이다. */
const MARGIN_X = 10;
const MARGIN_Y = 34;
const PANEL_H = 460;
// 설정 패널은 알약이 넓어져도 따라 넓어지지 않는다. overlay.css와 같은 값.
const PANEL_W = 360;
const MIN_W = 180;

let cfg = { ...DEFAULTS };
let log = [];

function load() {
  try {
    cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("dice.cfg") || "{}") };
    log = JSON.parse(localStorage.getItem("dice.log") || "[]");
  } catch (_) {
    cfg = { ...DEFAULTS };        // 저장소를 못 읽어도 굴리기는 동작해야 한다
    log = [];
  }
}
function save() {
  try {
    localStorage.setItem("dice.cfg", JSON.stringify(cfg));
    localStorage.setItem("dice.log", JSON.stringify(log.slice(0, LOG_MAX)));
  } catch (_) { /* 저장에 실패해도 이번 굴림은 그대로 진행한다 */ }
}

/* ── 굴리기 ───────────────────────────────────────────── */

const pick = (n) => 1 + Math.floor(Math.random() * n);

/* 목표 표기. 어느 쪽이 성공인지 부등호로 분명히 보여 준다. */
function goalText(sides, target) {
  if (!target) return "";
  return sides === 100 ? `≤ ${target}%` : `≥ DC ${target}`;
}

/* 판정. 주사위마다 성공 방향이 다르다.

   d100은 백분율 굴림이라 **낮을수록** 좋다. 목표가 곧 성공 확률이어서
   '기술 55%'면 55 이하가 성공이다(크툴루의 부름 같은 d100 시스템).
   나머지는 d20+수정치가 DC 이상이어야 하므로 **높을수록** 좋다.

   헷갈리기 쉬워서 화면에도 부등호를 함께 표시한다. 목표가 없으면
   판정하지 않고 굴린 값만 보여 준다.

   대성공·대실패를 무엇으로 정할지는 규칙마다 다르므로 설정으로 뺐다.

     주사위 눈  주사위 눈이 정한다. d20의 20과 1, d100의 05 이하와 96 이상.
                수정치가 아무리 커도 눈이 1이면 대실패다. D&D 공격 굴림이
                이렇다(자연 1은 무조건 빗나간다). 목표가 없어도 판정한다.
     목표 차이  합계가 목표에서 얼마나 떨어졌는지가 정한다. CRIT_EDGE 이상
                넘기면 대성공, 그만큼 모자라면 대실패다. 패스파인더 2판 방식이다.
                눈 하나로 결과가 뒤집히지 않는 대신 목표가 있어야 한다. */
function judge(sides, value, total, target, mode) {
  if (mode === "nat") {
    if (sides === 20 && value === 20) return { kind: "crit", text: "대성공" };
    if (sides === 20 && value === 1) return { kind: "fumble", text: "대실패" };
    if (sides === 100 && value <= 5) return { kind: "crit", text: "대성공" };
    if (sides === 100 && value >= 96) return { kind: "fumble", text: "대실패" };
  }
  if (!target) return null;
  // 목표를 얼마나 넘겼는지. d100은 낮을수록 좋으므로 부호가 반대다.
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
  // 수정치 주사위도 함께 굴린다. d100은 백분율이라 더하지 않는다.
  // 55% 판정에 d6을 더하면 더 이상 백분율이 아니다.
  const extras = sides === 100 ? [] : cfg.extra.map((n) => ({ sides: n, value: pick(n) }));
  const bonus = extras.reduce((a, e) => a + e.value, 0);
  const raw = sides === 100 ? value : value + bonus + cfg.mod;
  /* 하한은 보기 싫은 음수를 가리기 위한 표시용이지 규칙이 아니다.

     예전에는 판정도 하한을 적용한 값으로 했는데, 그러면 하한 1, DC 10일 때
     합계가 목표에서 10 이상 멀어질 수 없어서 '목표 차이' 기준의 대실패가
     절대 나오지 않았다. 켜 둔 규칙이 아무 표시 없이 동작하지 않은 것이다.
     보이는 숫자와 판정이 어긋나는 건 감수한다. 숫자에 마우스를 올리면
     원래 합계가 그대로 나온다.

     d100은 백분율이라 하한을 적용하지 않는다. 3% 굴림을 하한으로 올리면
     더 이상 백분율이 아니다. */
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
  // 수정치 주사위는 작게, 간격을 두고 놓는다. 주 주사위와 헷갈리면 안 된다.
  for (const e of extras) {
    const die = Dice.of(e.sides, e.value, { size: Math.round(cfg.size * 0.68), material: cfg.material });
    die.classList.add("side");
    tray.append(die);
  }

  $("lb").textContent = cfg.label || "";
  $("val").textContent = total;
  /* 계산 과정은 결과 숫자의 툴팁으로 보여 준다.

     예전에는 알약에 괄호로 적었는데('-5 (1 - 6) / ≥ DC 10'), 수정치 주사위까지
     붙으면 알약이 너무 길어진다. 그렇다고 아예 없애면 안 된다. 대성공·대실패를
     합계가 아니라 주사위 눈으로 정할 때(d20의 20과 1) '-5 대실패'만 보이면
     수정치 때문에 대실패가 난 것처럼 읽힌다.
     그래서 평소에는 결과만 보여 주고, 계산 과정은 마우스를 올리면 나온다.

     HTML 말풍선 대신 title 툴팁을 쓰는 이유: 창이 알약 모양으로 잘려 있어서
     (main.py의 cut_to_shape) 화면 안에 그린 말풍선은 알약 밖으로 나가면 잘린다.
     title 툴팁은 운영체제가 별도 창으로 그리므로 잘리지 않는다. */
  // 부호는 join이 붙인다. 여기서 '+'를 또 붙이면 '14 + +10'이 된다.
  const parts = [String(value), ...extras.map((e) => String(e.value))];
  if (cfg.mod) parts.push(String(cfg.mod));
  const note = (parts.length > 1 && sides !== 100)
    ? `${parts.join(" + ").replace(/\+ -/g, "- ")} = ${raw}` +
      (capped ? ` → 하한 ${total}` : "")       // 하한이 적용됐으면 그것도 표시한다
    : "";
  $("goal").textContent = cfg.target ? "/ " + goalText(sides, cfg.target) : "";
  $("verdict").textContent = verdict ? verdict.text : "";
  // 굴리는 동안에는 툴팁도 비운다. 툴팁으로 결과가 미리 보이면 안 된다.
  $("val").title = "";
  fitWindow();

  const entry = {
    at: Date.now(), sides, roll: value, total,
    extra: extras.map((e) => e.value),
    label: cfg.label, target: cfg.target,
    kind: verdict ? verdict.kind : "", text: verdict ? verdict.text : "",
  };

  /* 결과는 주사위가 멈춘 뒤에 표시한다. 미리 보이면 굴리는 의미가 없다.

     기록도 이 시점에 남긴다. 클릭하는 순간 기록하면, 주사위가 멈추기 전에
     다시 클릭할 때마다 화면에 나오지 않은 굴림이 기록에만 쌓인다. 위의
     clearTimeout이 앞선 굴림의 결과 표시를 취소하기 때문이다. 결과가
     표시되지 않은 굴림은 없었던 것으로 처리한다. */
  const until = Math.max(1000, ...[...tray.children].map((d) => Number(d.dataset.ms) || 0));
  rollTimer = setTimeout(() => {
    pill.className = "pill" + (verdict ? " " + verdict.kind : "");
    $("val").title = note;
    log.unshift(entry);
    log = log.slice(0, LOG_MAX);
    save();
    if (!$("panel").hidden && !$("p-log").hidden) renderLog();   // 기록 탭이 열려 있으면 바로 갱신
  }, until);
}

/* ── 그리기 ───────────────────────────────────────────── */

/* 굴리기 전 상태. 결과를 미리 보여 주면 안 되므로 눈은 표시하지 않는다. */
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
    b.title = "클릭하면 추가, 우클릭하면 빼기";
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
  // '목표 차이' 기준인데 목표가 없으면 판정이 표시되지 않는다. 고장처럼 보이므로 안내한다.
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
    box.innerHTML = '<div class="log-empty">아직 굴린 기록이 없습니다.</div>';
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

/* 현재 설정에서 나올 수 있는 가장 긴 결과 표시.

   알약 너비로 결과가 드러나면 안 된다. 결과 글자는 굴리는 동안 opacity 0으로
   숨기지만 자리는 그대로 차지한다. 그래서 '대실패'가 나올 굴림은 주사위가
   멈추기도 전에 알약이 길어졌고, 너비만 보고도 결과를 짐작할 수 있었다.

   그래서 너비는 실제 결과가 아니라 '나올 수 있는 결과 중 가장 긴 것'으로
   잡는다. 어떤 눈이 나와도 알약 너비가 같고, 굴리기 전과도 같다. */
function widestRead(sides) {
  const goal = cfg.target ? "/ " + goalText(sides, cfg.target) : "";
  // 대성공·대실패가 나올 수 있는 설정이면 세 글자만큼 자리를 잡아 둔다.
  const big = (cfg.crit === "nat" && (sides === 20 || sides === 100))
           || (cfg.crit === "num" && cfg.target);
  const verdict = big ? "대실패" : (cfg.target ? "실패" : "");
  if (sides === 100) return { val: "100", goal, verdict };

  // 합계가 될 수 있는 최솟값과 최댓값. 자릿수는 중간값이 아니라 양 끝에서 가장 길다.
  const lo = 1 + cfg.extra.length + cfg.mod;          // 모든 주사위가 최솟값일 때
  const hi = sides + cfg.extra.reduce((a, n) => a + n, 0) + cfg.mod;
  const capped = cfg.floor !== null && lo < cfg.floor;
  const ends = [String(capped ? cfg.floor : lo), String(hi)];
  return { val: ends[1].length >= ends[0].length ? ends[1] : ends[0], goal, verdict };
}

/* 창 크기를 내용에 맞춘다. 판정 이름이 길면 알약도 길어져야 하고, 짧으면
   빈 공간이 남으면 안 된다.
   다음 프레임에 재는 이유: 방금 바꾼 글자의 너비가 아직 반영되지 않았다.

   크기와 함께 창을 잘라 낼 모양도 보낸다. 창은 주사위가 튀어 오를 공간
   때문에 알약보다 넓다. 그 빈 공간이 창으로 남아 있으면 아래 프로그램을
   가리므로, main.py가 여기서 넘긴 영역만 남기고 잘라 낸다.
   각 영역은 [왼쪽, 위, 오른쪽, 아래, 모서리 반지름]이고 창 안쪽 CSS 픽셀 기준이다.
   재지 않고 계산하는 이유: 창이 아직 새 크기로 바뀌기 전이라 패널을 재면 틀린다. */
function fitWindow() {
  requestAnimationFrame(() => {
    const pill = $("pill");
    const open = !$("panel").hidden;

    /* 너비로 결과가 드러나지 않도록, 잴 때만 '가장 긴 경우'를 넣어 본다.
       그리고 잰 너비를 알약에 고정한다. 창 너비만 고정하면 소용이 없다.
       눈에 보이는 건 창이 아니라 알약이고, 알약은 내용만큼만 차지하므로
       창이 넓어도 알약은 결과에 따라 줄었다 늘었다 한다. */
    const slots = [$("val"), $("goal"), $("verdict")];
    const keep = slots.map((el) => el.textContent);
    const wide = widestRead(cfg.sides);
    slots[0].textContent = wide.val;
    slots[1].textContent = wide.goal;
    slots[2].textContent = wide.verdict;
    pill.style.width = "";                      // 잴 때는 내용만큼 늘어나게 둔다
    const pw = Math.ceil(pill.offsetWidth);
    const ph = Math.ceil(pill.offsetHeight);
    slots.forEach((el, i) => { el.textContent = keep[i]; });
    pill.style.width = pw + "px";               // 이제 어떤 결과가 나와도 이 너비다
    const w = Math.max(open ? PANEL_W + MARGIN_X * 2 : 0, MIN_W, pw + MARGIN_X * 2);
    // 위쪽 여백은 항상 남긴다(주사위가 튀어 오른다). 아래쪽은 패널이 대신 채운다.
    const h = MARGIN_Y + ph + (open ? 8 + PANEL_H + 10 : MARGIN_Y);

    // 잘라 낼 영역은 그림보다 조금씩 넉넉하게 잡는다. 창을 자르는 경계선은
    // 계단처럼 각지므로, 알약의 둥근 끝이 아니라 빈 곳을 지나가야
    // 눈에 띄지 않는다.
    const pad = 8;
    const tray = $("tray").getBoundingClientRect();
    const shape = [
      [MARGIN_X - pad, MARGIN_Y - pad, MARGIN_X + pw + pad, MARGIN_Y + ph + pad,
       ph / 2 + pad],
      // 주사위가 튀어 오르는 공간. 여기는 잘라 내면 안 된다.
      [Math.floor(tray.left) - 10, 0, Math.ceil(tray.right) + 10, MARGIN_Y + ph, 0],
    ];
    if (open) {
      // 창이 알약 때문에 더 넓어져도 설정 패널은 자기 너비만큼만 남긴다.
      shape.push([MARGIN_X - 4, MARGIN_Y + ph + 8 - 4,
                  MARGIN_X + PANEL_W + 4, h - 10 + 4, 18]);
    }
    py()?.resize(w, h, shape);
  });
}

/* ── 창 드래그 ────────────────────────────────────────────
   pywebview의 드래그 영역(.pywebview-drag-region)은 쓰지 않는다. 이 방식은
   window에 mousemove를 걸어 두는데, 창이 커서를 따라오는 사이에 커서가
   창 밖으로 한 번 나가면 이벤트가 끊겨서 드래그가 중간에 풀린다.
   포인터를 캡처하면(setPointerCapture) 커서가 어디에 있든 이벤트를 계속 받는다.

   알약 전체가 드래그 손잡이다. 주사위를 잡고 끌 수도 있어야 하고,
   주사위를 클릭해서 굴릴 수도 있어야 한다. 둘은 움직인 거리로 구분한다. */
const DRAG_SLOP = 4;
let grab = null;

function onGrab(e) {
  if (e.button !== 0 || e.target.closest(".knob")) return;   // 설정 버튼은 제외한다
  // 무엇을 눌렀는지는 지금 기록해 둬야 한다. 포인터를 캡처한 뒤로는 이어지는
  // 이벤트의 target이 캡처한 요소(알약)로 바뀌어서, 나중에는 주사위를
  // 눌렀는지 알 수 없다.
  grab = { id: e.pointerId, from: e.target, ox: e.clientX, oy: e.clientY,
           sx: e.screenX, sy: e.screenY, moved: false, at: null, frame: 0 };
  try { $("pill").setPointerCapture(e.pointerId); } catch (_) { /* 캡처에 실패해도 드래그는 한다 */ }
}

function onHaul(e) {
  if (!grab || e.pointerId !== grab.id) return;
  if (!grab.moved) {
    if (Math.abs(e.screenX - grab.sx) < DRAG_SLOP &&
        Math.abs(e.screenY - grab.sy) < DRAG_SLOP) return;
    grab.moved = true;
  }
  // 잡은 지점이 커서 아래에 그대로 있어야 한다: 창 왼쪽 = 커서 위치 - 잡은 지점.
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
  try { $("pill").releasePointerCapture(id); } catch (_) { /* 이미 해제됐다 */ }
  // 드래그했으면 클릭이 아니다. 주사위를 잡고 옮겼는데 굴러가면 안 된다.
  if (!moved && from && from.closest(".tray")) roll();
}

/* 설정을 열면 창을 키워서 보여 준다. 설정을 닫으면 알약만 남는다. */
function openPanel(on) {
  $("panel").hidden = !on;
  document.body.classList.toggle("open", on);
  if (on) { renderPicks(); renderLog(); applyLook(); }
  fitWindow();
}

/* ── 이벤트 연결 ──────────────────────────────────────── */

function wire() {
  // 굴리기는 onDrop에서 한다. 드래그인지 클릭인지는 거기서만 알 수 있다.
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
  // 비워 두면 하한 없음. 0은 '없음'이 아니라 0이므로 Number(..)||0을 쓰면 안 된다.
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

/* 처음 창 크기 맞춤은 pywebview 연결이 준비된 뒤에 한다.

   renderIdle() 안의 fitWindow()는 이 시점에는 아무 일도 하지 않는다.
   window.pywebview가 아직 없어서 py()가 undefined이고, ?.가 조용히 넘어간다.
   그래서 창은 pywebview가 처음 만든 크기(404x101) 그대로 남고, 알약은 168px인데
   창만 넓은 상태가 된다. 굴리거나 설정을 열어야 비로소 크기가 맞춰졌다.
   pywebviewready 이벤트는 연결이 준비되는 순간 한 번 발생한다. */
if (py()) fitWindow();
else window.addEventListener("pywebviewready", fitWindow, { once: true });
