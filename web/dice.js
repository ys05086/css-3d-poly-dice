"use strict";
/* 3D 주사위. 이 파일은 어느 앱에도 묶여 있지 않다 ─ dice.css 와 이 파일만
   가져가면 아무 페이지에서나 쓸 수 있다. 전역도 Dice 하나만 만든다.

     Dice.d20(17)                       정이십면체
     Dice.d10(7, { band: "tens" })      십면체 (0~9 또는 00~90)
     Dice.d6("＋")                      육면체 (퍼지 주사위)
     Dice.percentile(62)                십면체 두 알 [십의자리, 일의자리]

   옵션은 { size, material, band } 셋뿐이고 전부 생략할 수 있다.
   반환값은 DOM 요소라 그냥 append 하면 굴러간다. 애니메이션은 CSS 가
   하므로 자바스크립트가 매 프레임 관여하지 않는다.

   재질: mat-onyx(기본) mat-marble mat-steel mat-ivory mat-neon mat-oak */

/* 이 파일만으로 돌아야 하므로 HTML 이스케이프도 직접 한다. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── 주사위 ─────────────────────────────────────────────
   굴리는 맛이 있어야 한다. 결과 숫자 한 줄로 끝내면
   굴렸다는 느낌이 안 난다.
   다만 모양은 맞아야 한다. 눈이 스무 개인 주사위를 여섯 면짜리
   정육면체로 그리면 그건 주사위가 아니라 그냥 상자다. */

/* 주사위마다 구르는 축·바퀴 수·속도·튀는 높이를 새로 뽑는다.

   축 하나를 정해 그 축으로만 돌린다. rotateX/Y/Z 세 개를 따로 보간하면
   짐벌처럼 비틀려서 구르는 게 아니라 꿀렁거린다.
   축이 매번 다르니 키프레임 하나로도 넷이 전부 다르게 구른다.

   축은 화면 평면에 가깝게 잡는다. Z 축으로 돌면 구르는 게 아니라
   동전처럼 제자리에서 도는 꼴이 된다.
   바퀴 수는 한두 바퀴면 족하다 ─ 1초에 네 바퀴는 주사위가 아니라 팽이다. */
function tumbleVars(el) {
  const th = Math.random() * Math.PI * 2;
  el.style.setProperty("--ax", Math.cos(th).toFixed(4));
  el.style.setProperty("--ay", Math.sin(th).toFixed(4));
  el.style.setProperty("--az", ((Math.random() - 0.5) * 0.6).toFixed(4));

  // --turn 은 '아직 남은 각도'다. 여기서 시작해 0 으로 풀리고, 0 이 곧
  // 결과 면이 정면인 자세다. 그래서 시작값은 360 의 배수가 아니어야 한다 ─
  // 배수로 두면 첫 프레임부터 결과가 정면에 서서 던지기 전에 답이 보인다.
  const turns = Math.random() < 0.38 ? 1 : 2;
  const offset = 40 + Math.floor(Math.random() * 280);
  // 많이 돌수록 오래 구른다. 그래야 회전이 빨라지지 않고 '더 굴렀다'가 된다.
  const dur = 760 + turns * 170 + Math.floor(Math.random() * 300);
  const delay = Math.floor(Math.random() * 160);

  el.style.setProperty("--turn", `${-(turns * 360 + offset)}deg`);
  // 던져 올리는 높이. 폭이 넓어야 살짝 굴린 것과 확 던진 것이 갈린다.
  // 제곱을 섞어 낮은 쪽이 더 자주 나오게 한다 ─ 매번 높이 뜨면 그게 기본이 된다.
  const r = Math.random();
  el.style.setProperty("--hop", `${(7 + r * r * 27).toFixed(1)}px`);
  el.style.setProperty("--dur", `${dur}ms`);
  el.style.setProperty("--delay", `${delay}ms`);
  // 호출하는 쪽이 언제 결과를 드러낼지 정하려면 언제 멈추는지 알아야 한다.
  el.dataset.ms = String(dur + delay);
  return el;
}

/* 퍼지 주사위. 여섯 면에 ＋／０／－ 가 박힌 진짜 정육면체라
   아무 축으로나 구르다가 앞면에 결과를 세우고 멈춘다. */
const FUDGE = ["＋", "０", "－"];

/* 육면체는 두 몫을 한다. 퍼지 주사위(＋／０／－)와 보통 d6.
   결과가 퍼지 기호면 나머지 면도 퍼지로, 숫자면 1~6 으로 채운다.
   늘 퍼지로 채우면 2d6 을 굴렸는데 옆면에 ＋ 가 붙어 나온다. */
function dieCube(finalText, size = 26, material) {
  const wrap = dieShell("die6", size, material);
  const fudge = FUDGE.includes(String(finalText));
  const pool = fudge
    // 퍼지 주사위는 같은 기호가 두 면씩 있다. 중복이 정상이다.
    ? Array.from({ length: 5 }, () => FUDGE[Math.floor(Math.random() * 3)])
    : pipPool([1, 2, 3, 4, 5, 6], finalText, 5);
  const faces = ["front", "back", "right", "left", "top", "bottom"].map((pos, i) =>
    `<span class="f ${pos}">${esc(String(i === 0 ? finalText : pool[i - 1]))}</span>`
  ).join("");
  wrap.innerHTML = `<span class="ico">${faces}</span>`;
  return wrap;
}

/* ── 정이십면체 ─────────────────────────────────────────
   평면 그림을 돌리면 보이는 면이 안 바뀌어서 동전처럼 보인다.
   퍼지 주사위가 자연스러웠던 건 진짜 3D 였기 때문이므로,
   같은 방식으로 삼각면 스무 장을 공간에 세운다.

   면 하나하나의 각도를 손으로 맞추면 반드시 틀리니 계산해서 뽑는다. */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1],
                    a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => V.mul(a, 1 / V.len(a)),
};

/* 고정 광원. 면마다 이 방향과의 각도로 밝기를 구워 둔다. */
const LIGHT = V.norm([-0.36, -0.72, 0.59]);

/* 0번 면이 정면(+Z)을 보도록 전체를 돌리는 회전. 그래야 착지가 회전 0 이
   되어 주사위 종류에 상관없이 같은 tumble 키프레임을 쓸 수 있다. */
function faceFront(verts, n0) {
  const axis = V.cross(n0, [0, 0, 1]);
  if (V.len(axis) < 1e-9) return verts;
  const u = V.norm(axis);
  const ang = Math.acos(Math.max(-1, Math.min(1, V.dot(n0, [0, 0, 1]))));
  const s = Math.sin(ang), k = Math.cos(ang);
  return verts.map((v) => V.add(V.add(V.mul(v, k), V.mul(V.cross(u, v), s)),
                                V.mul(u, V.dot(u, v) * (1 - k))));
}

/* ── 정다면체 ────────────────────────────────────────────
   면이 정n각형이기만 하면 배치 공식이 같다. d4·d8·d12·d20 이
   아래 두 함수를 같이 쓴다. (d10 만 면이 연 모양이라 따로 간다.) */

/* 꼭지 하나를 12시에 세운 정n각형. clip-path 와, 그 도형이 상자 안에서
   차지하는 가로·세로, 무게중심의 세로 위치, 내접반지름을 돌려준다. */
function ngonBox(n) {
  const pts = Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    return [Math.cos(a), Math.sin(a)];
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const clip = pts.map(([x, y]) => `${pct((x - x0) / w)} ${pct((y - y0) / h)}`).join(", ");
  return { w, h, clip: `polygon(${clip})`,
           pivot: -y0 / h,                  // 원점(=무게중심)의 세로 위치
           inradius: Math.cos(Math.PI / n) };
}

/* 꼭짓점과 면 목록에서 면마다 3D 자리·방향·밝기를 뽑는다.
   정다각형 면은 회전 대칭이라 '어느 꼭짓점을 위로 세울지' 고를 필요가
   없다 ─ 아무거나 하나 잡으면 clip-path 와 저절로 맞는다. */
function platonic(rawVerts, faceIdx, sides) {
  let verts = rawVerts.map(V.norm);                 // 외접구 반지름 1 로
  const mid = (f) => V.mul(f.map((i) => verts[i]).reduce(V.add), 1 / f.length);
  // 0번 면을 정면으로. 정다면체는 면 중심 방향이 곧 법선이다.
  verts = faceFront(verts, V.norm(mid(faceIdx[0])));

  // n 은 법선, e2 는 꼭지에서 중심 쪽(=화면 아래), e1 = e2 × n.
  // 그래야 e1 × e2 = n 이 되어 CSS 좌표계와 손이 맞는다.
  // lit 는 고정 광원과의 각도 ─ 멈춰 있을 때 면이 갈라져 보이게 하는 값.
  const faces = faceIdx.map((f) => {
    const c = mid(f);
    const n = V.norm(c);
    const e2 = V.norm(V.sub(c, verts[f[0]]));
    return { e1: V.cross(e2, n), e2, n, c, lit: Math.max(0, V.dot(n, LIGHT)) };
  });
  const box = ngonBox(sides);
  box.rp = V.len(V.sub(verts[faceIdx[0][0]], mid(faceIdx[0])));   // 면 외접반지름
  return { faces, box, sides };
}

/* 정이십면체의 꼭짓점과 면. 정십이면체가 이것의 쌍대라 따로 빼 둔다. */
const ICO_RAW = (() => {
  const P = (1 + Math.sqrt(5)) / 2;
  let verts = [];
  for (const a of [1, -1]) for (const b of [1, -1]) {
    verts.push([0, a, b * P], [a, b * P, 0], [b * P, 0, a]);   // 순환 치환
  }
  verts = verts.map(V.norm);
  const edge = Math.min(...verts.slice(1).map((v) => V.len(V.sub(v, verts[0]))));
  const near = (a, b) => Math.abs(V.len(V.sub(a, b)) - edge) < 1e-9;
  const faces = [];
  // 세 꼭짓점이 서로 모서리 하나 거리면 그게 한 면이다.
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      for (let k = j + 1; k < 12; k++)
        if (near(verts[i], verts[j]) && near(verts[j], verts[k]) && near(verts[i], verts[k]))
          faces.push([i, j, k]);
  return { verts, faces };
})();

/* 정십이면체 = 정이십면체의 쌍대. 이십면체 꼭짓점 하나를 둘러싼 면
   다섯 장의 중심을 이으면 오각형 한 장이 된다. 오각형 좌표를 직접
   적어 넣는 것보다 이쪽이 틀릴 구석이 없다. */
const DODECA_RAW = {
  verts: ICO_RAW.faces.map((f) =>
    V.mul(f.map((i) => ICO_RAW.verts[i]).reduce(V.add), 1 / 3)),
  faces: ICO_RAW.verts.map((_, vi) =>
    ICO_RAW.faces.reduce((acc, f, fi) => (f.includes(vi) ? acc.concat(fi) : acc), [])),
};

const SOLIDS = {
  // 정사면체. 네 꼭짓점 중 어느 셋을 골라도 면이다.
  4: platonic([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
              [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]], 3),
  // 정팔면체. 축마다 부호를 하나씩 고르면 여덟 면.
  8: platonic([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
              [[0, 2, 4], [0, 2, 5], [0, 3, 4], [0, 3, 5],
               [1, 2, 4], [1, 2, 5], [1, 3, 4], [1, 3, 5]], 3),
  12: platonic(DODECA_RAW.verts, DODECA_RAW.faces, 5),
  20: platonic(ICO_RAW.verts, ICO_RAW.faces, 3),
};

/* ── 오각 트라페조헤드론(d10) ─────────────────────────────
   연 모양 면 열 장. 위아래 꼭짓점 둘에, 서로 36° 엇갈린 다섯 개짜리
   고리 둘을 두른다.

   꼭짓점 높이는 아무 값이나 되지 않는다. 연의 네 점이 한 평면에 놓이는
   비율이 딱 하나 있고, 어긋나면 면이 접혀서 clip-path 로는 못 그린다.
   그 값을 이분법으로 찾는다. */
const D10 = (() => {
  const T = (Math.PI * 2) / 5;
  // 고리 높이. 주사위가 납작한 정도를 정한다 ─ 키우면 길쭉해진다.
  const c = 0.112;
  const ring = (a, z) => [Math.cos(a), Math.sin(a), z];

  // 네 번째 점이 앞 세 점의 평면에서 얼마나 벗어나는가. 0 이면 평면이다.
  const bend = (d) => {
    const A = [0, 0, d], U0 = ring(0, c), U1 = ring(T, c), L0 = ring(T / 2, -c);
    return V.dot(V.cross(V.sub(U0, A), V.sub(U1, A)), V.sub(L0, A));
  };
  let lo = c * 1.05, hi = c * 40;
  for (let s = lo; s < c * 40; s += c * 0.25) {    // 부호가 바뀌는 구간을 잡고
    if (bend(lo) * bend(s) <= 0) { hi = s; break; }
  }
  for (let i = 0; i < 90; i++) {                   // 그 안에서 이분법
    const mid = (lo + hi) / 2;
    if (bend(lo) * bend(mid) <= 0) hi = mid; else lo = mid;
  }
  const d = (lo + hi) / 2;

  let verts = [[0, 0, d], [0, 0, -d]];                             // 0,1 = 위·아래 꼭지
  for (let i = 0; i < 5; i++) verts.push(ring(i * T, c));          // 2..6  윗고리
  for (let i = 0; i < 5; i++) verts.push(ring(i * T + T / 2, -c)); // 7..11 아랫고리
  const U = (i) => 2 + (i % 5), L = (i) => 7 + (i % 5);

  // 연은 [꼭지, 옆, 먼쪽, 옆] 순. 먼쪽이 꼭지 반대편 끝이다.
  const faces = [];
  for (let i = 0; i < 5; i++) faces.push([0, U(i), L(i), U(i + 1)]);
  for (let i = 0; i < 5; i++) faces.push([1, L(i), U(i + 1), L(i + 1)]);

  const R0 = Math.max(...verts.map(V.len));
  verts = verts.map((v) => V.mul(v, 1 / R0));      // 외접구 반지름 1

  // 연은 무게중심 방향과 법선이 어긋난다. 삼각면처럼 대충 쓰면 안 된다.
  const normalOf = (f, vs) => {
    const [A, S1, F, S2] = f.map((i) => vs[i]);
    const n = V.norm(V.cross(V.sub(S1, A), V.sub(F, A)));
    const on = V.mul(V.add(V.add(A, F), V.add(S1, S2)), 0.25);
    return V.dot(n, on) < 0 ? V.mul(n, -1) : n;    // 바깥을 보게
  };
  verts = faceFront(verts, normalOf(faces[0], verts));

  const shape = (f) => {
    const [A, S1, F, S2] = f.map((i) => verts[i]);
    const H = V.len(V.sub(F, A));                  // 긴 대각선
    const W = V.len(V.sub(S2, S1));                // 짧은 대각선
    const kite = V.len(V.sub(V.mul(V.add(S1, S2), 0.5), A)) / H;  // 둘이 만나는 지점
    return { A, S1, F, S2, H, W, kite, mid: (kite + 1) / 3 };     // mid = 무게중심
  };
  const built = faces.map((f) => {
    const { A, F, H, W, kite, mid } = shape(f);
    const n = normalOf(f, verts);
    const e2 = V.norm(V.sub(F, A));
    return { e1: V.cross(e2, n), e2, n, H, W, kite, mid,
             c: V.add(A, V.mul(V.sub(F, A), mid)),
             lit: Math.max(0, V.dot(n, LIGHT)) };
  });
  const s0 = shape(faces[0]);
  // 극축. 꼭지에서 꼭지로 꿰는 축이다 ─ 진짜 d10 이 팽이처럼 도는 그 축.
  // 정면을 맞추느라 전체를 돌렸으니 +Z 가 아니라 여기 어딘가에 있다.
  return { faces: built, pole: V.norm(verts[0]),
           H: s0.H, W: s0.W, kite: s0.kite, mid: s0.mid };
})();

/* 나머지 면을 채울 눈금. 결과는 0번 면에 이미 박혀 있으므로 빼고 섞는다.
   빼지 않으면 같은 눈금이 주사위에 두 번 찍힌다.
   보정이 붙은 합계처럼 눈금에 없는 값이 결과로 오면 하나가 남는데,
   그건 잘라낸다 ─ 어차피 스무 면 중 하나가 안 보일 뿐이다. */
function pipPool(all, result, need) {
  const rest = all.filter((v) => String(v) !== String(result));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return rest.slice(0, need);
}

/* 자릿수가 늘면 글자를 줄인다. 면은 좁은데 '100' 이 들어올 수 있다. */
function fitFont(base, text) {
  const n = String(text).length;
  return base * (n >= 3 ? 0.66 : n === 2 ? 0.84 : 1);
}

/* 껍데기. 재질과 구르는 값은 주사위 종류와 무관하므로 여기서 다 끝낸다. */
function dieShell(kind, size, material) {
  const wrap = document.createElement("span");
  wrap.className = `poly-die ${kind} ${material || "mat-onyx"}`.trim();
  wrap.style.setProperty("--size", `${size}px`);
  tumbleVars(wrap);
  return wrap;
}

/* 면 한 장. 자리와 방향은 matrix3d 로, 무늬는 --grain 으로.
   pivot 은 면의 무게중심이 긴 축의 몇 할 지점인가 ─ 삼각형은 2/3,
   연은 계산해서 넣는다. 이 점이 주사위 중심에 오도록 마진을 준다. */
function faceHtml(f, R, W, H, pivot, text, font) {
  const m = [
    f.e1[0], f.e1[1], f.e1[2], 0,
    f.e2[0], f.e2[1], f.e2[2], 0,
    f.n[0], f.n[1], f.n[2], 0,
    f.c[0] * R, f.c[1] * R, f.c[2] * R, 1,
  ].map((v) => +v.toFixed(5)).join(",");
  return `<span class="face" style="width:${W.toFixed(2)}px;height:${H.toFixed(2)}px;` +
    `margin-left:${(-W / 2).toFixed(2)}px;margin-top:${(-H * pivot).toFixed(2)}px;` +
    `transform:matrix3d(${m});--lit:${f.lit.toFixed(3)};` +
    // 면마다 다른 난수. 대리석 결이나 유리 하이라이트를 이 값으로 밀어
    // 두면 면이 전부 다른 무늬가 된다.
    `--grain:${Math.random().toFixed(3)}">` +
    `<i style="font-size:${fitFont(font, text).toFixed(1)}px">` +
    `${esc(String(text))}</i></span>`;
}

/* 정다면체 주사위 한 알. 눈금은 1..면수, 결과는 언제나 0번 면(정면). */
function dieNgon(faceCount, finalText, size, material) {
  const geom = SOLIDS[faceCount];
  const R = size / 2;                                  // 외접구 반지름(px)
  const rp = geom.box.rp * R;                          // 면 외접반지름(px)
  // 1.05 배로 살짝 부풀려 이웃 면과 겹친다. 정확히 맞추면 모서리에 실금이 뜬다.
  const W = geom.box.w * rp * 1.05, H = geom.box.h * rp * 1.05;
  const pool = pipPool(Array.from({ length: faceCount }, (_, i) => i + 1),
                       finalText, faceCount - 1);
  const wrap = dieShell(`die${faceCount}`, size, material);
  // 모양은 CSS 가 모른다. 재서 넘겨준다.
  wrap.style.setProperty("--outline", geom.box.clip);
  wrap.style.setProperty("--pivot", `${(geom.box.pivot * 100).toFixed(2)}%`);
  // 글자는 면 안에 앉아야 한다. 삼각형은 좁고 오각형은 넓어서
  // 내접반지름에 비례시키되, 면 밖으로 나가지 않게 상한을 둔다.
  const font = Math.min(rp * geom.box.inradius * 1.5, rp * 0.95);
  wrap.innerHTML = "<span class=\"ico\">" + geom.faces.map((f, i) =>
    faceHtml(f, R, W, H, geom.box.pivot, i === 0 ? finalText : pool[i - 1], font)
  ).join("") + "</span>";
  return wrap;
}

/* 백분율은 십면체 두 알로 굴린다. 실제 d10 세트가 그렇게 생겼다 ─
   십의 자리 알은 00·10·…·90, 일의 자리 알은 0~9.
   한 알에 1~100 을 다 새긴 주사위는 세상에 없다. */
const D10_PIPS = {
  units: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  tens: ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
};

function die10(finalText, size = 44, material, band = "units") {
  const R = size / 2;
  const W = D10.W * R * 1.05, H = D10.H * R * 1.05;
  const pool = pipPool(D10_PIPS[band], finalText, 9);
  const wrap = dieShell("die10", size, material);
  // 연의 생김새는 CSS 가 모른다. 재서 넘겨준다.
  const kite = `${(D10.kite * 100).toFixed(2)}%`;
  wrap.style.setProperty("--outline",
    `polygon(50% 0%, 100% ${kite}, 50% 100%, 0% ${kite})`);
  wrap.style.setProperty("--pivot", `${(D10.mid * 100).toFixed(2)}%`);

  // 제 극축으로 따로 한 번 더 돈다. 겉의 tumble 과 겹쳐야 팽이처럼 보인다.
  wrap.style.setProperty("--px", D10.pole[0].toFixed(4));
  wrap.style.setProperty("--py", D10.pole[1].toFixed(4));
  wrap.style.setProperty("--pz", D10.pole[2].toFixed(4));
  // 겉보다 많이 돈다. 이쪽이 느리면 그냥 같이 구르는 것으로 보인다.
  const spins = 3 + Math.floor(Math.random() * 3);
  wrap.style.setProperty("--pturn",
    `${-(spins * 360 + 40 + Math.floor(Math.random() * 280))}deg`);

  const faces = D10.faces.map((f, i) =>
    faceHtml(f, R, W, H, D10.mid, i === 0 ? finalText : pool[i - 1], D10.W * R * 0.44)
  ).join("");
  wrap.innerHTML = `<span class="ico"><span class="spin">${faces}</span></span>`;
  return wrap;
}

/* ── 내보내는 것 ────────────────────────────────────────
   위의 것들은 전부 이 파일 안에서 끝난다. 밖에서 쓰는 건 이것뿐이다. */
/* 같은 --size 라도 눈에 보이는 덩치는 다르다. 다면체는 구에 내접해
   상자 안에 여백이 남지만 육면체는 상자를 꽉 채운다. 그대로 두면
   2d6 을 d20 옆에 놓았을 때 육면체만 유난히 커 보인다.

   크기를 직접 넘길 때만 보정한다 ─ '이만한 크기로 나란히 놓아 달라'는
   뜻이기 때문이다. 기본값은 각자 자기 자리에 맞게 이미 맞춰 둔 값이라
   건드리지 않는다(페이트는 네 알이 한 줄에 서므로 원래 작다).

   육면체는 배율이 1 이다. 상자는 남들과 같은 크기로 두고, 대신 그
   안에서 작게 그린다(dice.css 의 --fill). 상자까지 줄이면 알약이
   육면체일 때만 홀쭉해져서 다른 주사위와 자리가 안 맞는다. */
const BULK = { 4: 1, 6: 1, 8: 0.95, 10: 0.92, 12: 1, 20: 1 };
const sized = (sides, o, base) => Math.round(o.size ? o.size * BULK[sides] : base);

const Dice = {
  d4: (value, o = {}) => dieNgon(4, value, sized(4, o, 48), o.material),
  d6: (value, o = {}) => dieCube(value, sized(6, o, 26), o.material),
  d8: (value, o = {}) => dieNgon(8, value, sized(8, o, 48), o.material),
  d10: (value, o = {}) => die10(value, sized(10, o, 44), o.material, o.band || "units"),
  d12: (value, o = {}) => dieNgon(12, value, sized(12, o, 48), o.material),
  d20: (value, o = {}) => dieNgon(20, value, sized(20, o, 48), o.material),

  /* 면 수로 골라 굴린다. d6 과 d10 은 정다면체 규칙 밖이라 따로 받는다. */
  of(sides, value, o = {}) {
    if (sides === 6) return Dice.d6(value, o);
    if (sides === 10) return Dice.d10(value, o);
    if (!SOLIDS[sides]) throw new Error(`없는 주사위: d${sides}`);
    return dieNgon(sides, value, sized(sides, o, 48), o.material);
  },

  /* 같은 크기로 보이게 하는 배율. 오버레이가 칸을 잡을 때도 쓴다. */
  BULK,

  SIDES: [4, 6, 8, 10, 12, 20],

  /* 백분율 한 판은 십면체 두 알이다. 실제 d10 세트가 그렇게 생겼다.
     00+0 은 관례대로 100 으로 읽는다. */
  percentile(value, o = {}) {
    const n = ((Math.trunc(Number(value)) % 100) + 100) % 100;
    return [
      die10(D10_PIPS.tens[Math.floor(n / 10)], o.size || 44, o.material, "tens"),
      die10(D10_PIPS.units[n % 10], o.size || 44, o.material, "units"),
    ];
  },

  MATERIALS: ["mat-onyx", "mat-marble", "mat-steel",
              "mat-ivory", "mat-neon", "mat-oak"],
};
