"""주사위를 SVG 한 장으로 그린다. 자바스크립트 없이 굴러간다.

<img> 로 불린 SVG 안에서는 스크립트가 차단되고 foreignObject 도 렌더되지
않는다. CSS 3D(transform-style: preserve-3d)도 SVG 요소에는 안 먹는다.
남는 것은 SMIL(<animate>) 뿐이다.

그래서 web/dice.js 가 하던 일을 뒤집었다. 브라우저에서는 면을 3D 공간에
세워 두고 CSS 가 굴리지만, 여기서는 서버가 회전 각 프레임마다 면을 미리
정사영해 두고 SMIL 이 그 좌표들 사이를 이어 준다.
결과는 같다 ─ 면이 실제로 넘어가는 다면체가 스크립트 없이 굴러간다.

볼록 다면체라서 앞면끼리는 화면에서 겹치지 않는다. 그래서 깊이 정렬이
필요 없고, 뒤를 보는 면만 숨기면 된다. SMIL 은 그리는 순서를 못 바꾸므로
이 성질이 없었다면 이 방식 자체가 불가능했다.
"""
from __future__ import annotations

import math
import random
from typing import Iterable, Optional

# ── 벡터 ────────────────────────────────────────────────
Vec = tuple[float, float, float]


def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a: Vec, k: float) -> Vec:
    return (a[0] * k, a[1] * k, a[2] * k)


def _dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _len(a: Vec) -> float:
    return math.sqrt(_dot(a, a))


def _norm(a: Vec) -> Vec:
    n = _len(a)
    return _mul(a, 1.0 / n) if n else a


def _rotate(v: Vec, axis: Vec, ang: float) -> Vec:
    """로드리게스 회전. 축은 단위벡터여야 한다."""
    c, s = math.cos(ang), math.sin(ang)
    return _add(_add(_mul(v, c), _mul(_cross(axis, v), s)),
                _mul(axis, _dot(axis, v) * (1 - c)))


# ── 다면체 ──────────────────────────────────────────────
def _icosahedron() -> tuple[list[Vec], list[list[int]]]:
    p = (1 + math.sqrt(5)) / 2
    verts: list[Vec] = []
    for a in (1, -1):
        for b in (1, -1):
            verts += [(0, a, b * p), (a, b * p, 0), (b * p, 0, a)]
    verts = [_norm(v) for v in verts]
    edge = min(_len(_sub(v, verts[0])) for v in verts[1:])
    faces = [[i, j, k]
             for i in range(12) for j in range(i + 1, 12) for k in range(j + 1, 12)
             if all(abs(_len(_sub(verts[x], verts[y])) - edge) < 1e-9
                    for x, y in ((i, j), (j, k), (i, k)))]
    return verts, faces


def _dodecahedron() -> tuple[list[Vec], list[list[int]]]:
    """정이십면체의 쌍대. 꼭짓점 하나를 둘러싼 면 다섯의 중심이 오각형 한 장."""
    iv, ifaces = _icosahedron()
    verts = [_norm(_mul(_add(_add(iv[f[0]], iv[f[1]]), iv[f[2]]), 1 / 3)) for f in ifaces]
    faces = [[fi for fi, f in enumerate(ifaces) if vi in f] for vi in range(len(iv))]
    return verts, faces


def _trapezohedron() -> tuple[list[Vec], list[list[int]]]:
    """오각 트라페조헤드론(d10). 연 모양 면 열 장.

    꼭짓점 높이는 아무 값이나 되지 않는다. 연의 네 점이 한 평면에 놓이는
    비율이 딱 하나 있어 그것을 이분법으로 찾는다.
    """
    t = math.tau / 5
    c = 0.112

    def ring(a: float, z: float) -> Vec:
        return (math.cos(a), math.sin(a), z)

    def bend(d: float) -> float:
        A, U0, U1 = (0.0, 0.0, d), ring(0, c), ring(t, c)
        return _dot(_cross(_sub(U0, A), _sub(U1, A)), _sub(ring(t / 2, -c), A))

    lo, hi = c * 1.05, c * 40
    step = c * 0.25
    s = lo
    while s < c * 40:
        if bend(lo) * bend(s) <= 0:
            hi = s
            break
        s += step
    for _ in range(90):
        mid = (lo + hi) / 2
        if bend(lo) * bend(mid) <= 0:
            hi = mid
        else:
            lo = mid
    d = (lo + hi) / 2

    verts: list[Vec] = [(0, 0, d), (0, 0, -d)]
    verts += [ring(i * t, c) for i in range(5)]
    verts += [ring(i * t + t / 2, -c) for i in range(5)]
    up = lambda i: 2 + i % 5          # noqa: E731
    dn = lambda i: 7 + i % 5          # noqa: E731
    faces = [[0, up(i), dn(i), up(i + 1)] for i in range(5)]
    faces += [[1, dn(i), up(i + 1), dn(i + 1)] for i in range(5)]
    r = max(_len(v) for v in verts)
    return [_mul(v, 1 / r) for v in verts], faces


_CUBE_V: list[Vec] = [(x, y, z) for x in (1, -1) for y in (1, -1) for z in (1, -1)]
_CUBE_F = [[i for i, v in enumerate(_CUBE_V) if v[ax] == sign]
           for ax in (0, 1, 2) for sign in (1, -1)]

_RAW: dict[int, tuple[list[Vec], list[list[int]]]] = {
    4: ([(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)],
        [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]),
    6: (_CUBE_V, _CUBE_F),
    8: ([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)],
        [[a, b, c] for a in (0, 1) for b in (2, 3) for c in (4, 5)]),
    10: _trapezohedron(),
    12: _dodecahedron(),
    20: _icosahedron(),
}

SIDES = tuple(sorted(_RAW))


def _face_normal(verts: list[Vec], idxs: list[int]) -> Vec:
    """바깥을 보는 법선. 볼록 다면체라 면 위 아무 점과 방향이 같아야 한다."""
    pts = [verts[i] for i in idxs]
    n = _norm(_cross(_sub(pts[1], pts[0]), _sub(pts[2], pts[0])))
    mid = _mul(pts[0], 0)
    for p in pts:
        mid = _add(mid, p)
    mid = _mul(mid, 1 / len(pts))
    return _mul(n, -1) if _dot(n, mid) < 0 else n


def _order(verts: list[Vec], idxs: list[int]) -> list[int]:
    """면의 꼭짓점을 둘레 순서로 세운다. 삼각형은 상관없지만 사각형과
    오각형은 순서가 틀리면 폴리곤이 나비처럼 접힌다."""
    n = _face_normal(verts, idxs)
    mid = _mul(verts[idxs[0]], 0)
    for i in idxs:
        mid = _add(mid, verts[i])
    mid = _mul(mid, 1 / len(idxs))
    e1 = _norm(_sub(verts[idxs[0]], mid))
    e2 = _cross(n, e1)
    return sorted(idxs, key=lambda i: math.atan2(_dot(_sub(verts[i], mid), e2),
                                                 _dot(_sub(verts[i], mid), e1)))


def solid(sides: int) -> tuple[list[Vec], list[list[int]]]:
    """0번 면이 정면(+Z)을 보도록 돌려 둔 다면체."""
    raw_v, raw_f = _RAW[sides]
    verts = [_norm(v) for v in raw_v]
    faces = [_order(verts, f) for f in raw_f]
    n0 = _face_normal(verts, faces[0])
    axis = _cross(n0, (0, 0, 1))
    if _len(axis) > 1e-9:
        u = _norm(axis)
        ang = math.acos(max(-1.0, min(1.0, _dot(n0, (0, 0, 1)))))
        verts = [_rotate(v, u, ang) for v in verts]
    return verts, faces


# ── 재질 ────────────────────────────────────────────────
# web/dice.css 의 .mat-* 와 같은 값. 한쪽만 고치면 두 화면이 달라진다.
#              face(h, s, l0, l1)          edge(h, s, l0, l1)          ink
MATERIALS: dict[str, tuple[tuple, tuple, str]] = {
    "onyx":   ((250, 14, 4, 15),  (44, 64, 33, 45),  "#f2cf79"),
    "marble": ((220, 9, 60, 24),  (214, 11, 73, 19), "#2c3240"),
    "steel":  ((215, 9, 15, 42),  (210, 14, 40, 52), "#f3f7fc"),
    "ivory":  ((40, 26, 54, 30),  (36, 22, 66, 24),  "#3b2c19"),
    "neon":   ((286, 58, 13, 30), (300, 88, 44, 38), "#8ffaff"),
    "oak":    ((26, 34, 20, 24),  (30, 38, 36, 28),  "#f5e2c2"),
}
DEFAULT_MATERIAL = "onyx"
LIGHT: Vec = _norm((-0.36, -0.72, 0.59))


def _hsl(h: float, s: float, l: float) -> str:
    """hsl → #rrggbb. SVG 는 hsl() 도 받지만 SMIL values 목록에서는
    구형 렌더러가 헷갈려 해서 16진수로 못박는다."""
    s, l = s / 100.0, l / 100.0
    k = lambda n: (n + h / 30) % 12                                   # noqa: E731
    a = s * min(l, 1 - l)
    f = lambda n: l - a * max(-1.0, min(min(k(n) - 3, 9 - k(n)), 1))  # noqa: E731
    return "#" + "".join(f"{round(255 * max(0.0, min(1.0, f(n)))):02x}"
                         for n in (0, 8, 4))


def _shade(band: tuple, lit: float) -> str:
    h, s, l0, l1 = band
    return _hsl(h, s, l0 + lit * l1)


# ── 그리기 ──────────────────────────────────────────────
def _esc(text: str) -> str:
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def render(sides: int, value, material: str = DEFAULT_MATERIAL,
           size: int = 160, frames: int = 22, turns: int = 2,
           duration: float = 1.25, seed: Optional[int] = None) -> str:
    """주사위 한 알을 SVG 문자열로.

    value 는 멈췄을 때 정면(0번 면)에 뜨는 눈이다. 굴리는 동안에는
    아무 숫자도 보이지 않는다 ─ 결과가 미리 새면 굴리는 의미가 없다.
    """
    if sides not in _RAW:
        raise ValueError(f"없는 주사위: d{sides}")
    verts, faces = solid(sides)
    face_c, edge_c, ink = MATERIALS.get(material, MATERIALS[DEFAULT_MATERIAL])

    rng = random.Random(seed)
    # 축은 화면 평면에 가깝게. Z 축으로 돌면 구르는 게 아니라 동전처럼 돈다.
    th = rng.random() * math.tau
    axis = _norm((math.cos(th), math.sin(th), (rng.random() - 0.5) * 0.6))
    # 남은 각도는 (1-t)² 로 줄어든다 ─ 마찰에 밀려 멈추는 모양.
    start = turns * math.tau + rng.uniform(0.7, 5.5)
    steps = [start * (1 - i / (frames - 1)) ** 2 for i in range(frames)]

    R = size * 0.30                      # 외접구 반지름(px)
    cx = cy = size / 2
    hop = size * 0.11

    # 프레임마다 모든 꼭짓점을 미리 돌려 둔다.
    posed = [[_rotate(v, axis, a) for v in verts] for a in steps]

    def pts(frame: list[Vec], idxs: list[int]) -> str:
        # y 는 화면에서 아래로 자라므로 뒤집는다.
        return " ".join(f"{cx + frame[i][0] * R:.1f},{cy - frame[i][1] * R:.1f}"
                        for i in idxs)

    times = ";".join(f"{i / (frames - 1):.4f}" for i in range(frames))
    body: list[str] = []
    for idxs in faces:
        seq, fills, shows = [], [], []
        for frame in posed:
            n = _face_normal(frame, idxs)
            seq.append(pts(frame, idxs))
            fills.append(_shade(face_c, max(0.0, _dot(n, LIGHT))))
            # 볼록이라 앞면끼리는 안 겹친다. 뒤를 보는 면만 지우면 끝.
            shows.append("1" if n[2] > 0 else "0")
        stroke = _shade(edge_c, 0.55)
        body.append(
            f'<polygon points="{seq[0]}" fill="{fills[0]}" stroke="{stroke}"'
            f' stroke-width="{size * 0.009:.2f}" stroke-linejoin="round">'
            f'<animate attributeName="points" dur="{duration}s" fill="freeze"'
            f' keyTimes="{times}" values="{";".join(seq)}"/>'
            f'<animate attributeName="fill" dur="{duration}s" fill="freeze"'
            f' keyTimes="{times}" values="{";".join(fills)}"/>'
            f'<animate attributeName="opacity" dur="{duration}s" fill="freeze"'
            f' calcMode="discrete" keyTimes="{times}" values="{";".join(shows)}"/>'
            f"</polygon>")

    # 던져 올렸다 떨어지는 호. 도형 전체를 통째로 움직인다.
    arc = [(0, 0), (0.10, -0.56), (0.30, -1.0), (0.50, -0.77),
           (0.66, -0.27), (0.72, 0), (0.81, -0.17), (0.90, 0), (1.0, 0)]
    hop_t = ";".join(f"{t:.4f}" for t, _ in arc)
    hop_v = ";".join(f"0,{y * hop:.1f}" for _, y in arc)

    # 눈은 끝에서만 뜬다. 굴리는 내내 아무것도 안 보여야 한다.
    reveal = f"{max(0.0, 1 - 0.12):.4f}"
    font = size * (0.30 if len(str(value)) < 3 else 0.22)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}"'
        f' viewBox="0 0 {size} {size}" role="img"'
        f' aria-label="d{sides} {_esc(value)}">'
        f'<g><animateTransform attributeName="transform" type="translate"'
        f' dur="{duration}s" fill="freeze" keyTimes="{hop_t}" values="{hop_v}"/>'
        + "".join(body) +
        f'<text x="{cx:.1f}" y="{cy:.1f}" text-anchor="middle"'
        f' dominant-baseline="central" fill="{ink}" opacity="0"'
        f' font-family="system-ui,-apple-system,Segoe UI,sans-serif"'
        f' font-weight="700" font-size="{font:.1f}">{_esc(value)}'
        f'<animate attributeName="opacity" dur="{duration}s" fill="freeze"'
        f' calcMode="discrete" keyTimes="0;{reveal};1" values="0;1;1"/>'
        f"</text></g></svg>")


def percentile(value: int, **kw) -> tuple[str, str]:
    """백분율 한 판은 십면체 두 알. 00+0 은 관례대로 100 으로 읽는다."""
    n = int(value) % 100
    tens = f"{n // 10 * 10:02d}"
    return render(10, tens, **kw), render(10, str(n % 10), **kw)


def pips(sides: int) -> Iterable[str]:
    """그 주사위에 새길 수 있는 눈."""
    return (str(i) for i in range(1, sides + 1))
