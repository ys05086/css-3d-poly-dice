"""SVG 주사위 검증.

이 그림은 스크립트가 못 도는 자리(<img> 로 불린 SVG)에서 굴러가야 한다.
그 문맥에서는 고칠 방법이 없으니 여기서 다 걸러야 한다.

특히 기하는 web/dice.js 와 따로 구현되어 있어 어긋날 수 있다.
그래서 브라우저에서 확인하는 것과 같은 불변식을 여기서도 잰다.
"""
import io
import math
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import dicesvg as D  # noqa: E402

results = []


def check(label, condition, detail=""):
    results.append((bool(condition), label, detail))
    print(f"[{'PASS' if condition else 'FAIL'}] {label}" + (f"  -- {detail}" if detail else ""))


def section(name):
    print(f"\n─── {name} ───")


# ── 기하 ────────────────────────────────────────────────
section("다면체")

EXPECT = {4: (4, 3), 6: (6, 4), 8: (8, 3), 10: (10, 4), 12: (12, 5), 20: (20, 3)}
check("주사위 여섯 종류", set(D.SIDES) == set(EXPECT), str(D.SIDES))

for sides, (nfaces, nverts) in EXPECT.items():
    verts, faces = D.solid(sides)
    check(f"d{sides} 면 수 {nfaces}", len(faces) == nfaces, f"실제 {len(faces)}")
    check(f"d{sides} 면마다 꼭짓점 {nverts}",
          all(len(f) == nverts for f in faces),
          str(sorted({len(f) for f in faces})))

    # 0번 면이 정면을 봐야 착지했을 때 결과가 보인다.
    n0 = D._face_normal(verts, faces[0])
    check(f"d{sides} 0번 면이 정면(+Z)",
          all(abs(a - b) < 1e-9 for a, b in zip(n0, (0, 0, 1))),
          str(tuple(round(x, 6) for x in n0)))

    # 정다면체라면 모든 면 중심이 원점에서 같은 거리여야 한다.
    # 하나라도 어긋나면 면 목록이 틀렸다는 뜻이다.
    mids = []
    for f in faces:
        m = (0.0, 0.0, 0.0)
        for i in f:
            m = D._add(m, verts[i])
        mids.append(D._len(D._mul(m, 1 / len(f))))
    spread = max(mids) - min(mids)
    check(f"d{sides} 면 중심이 모두 같은 거리", spread < 1e-9, f"편차 {spread:.2e}")

    # 법선이 겹치면 같은 면을 두 번 그린 것이다.
    normals = {tuple(round(x, 6) for x in D._face_normal(verts, f)) for f in faces}
    check(f"d{sides} 법선이 면마다 다름", len(normals) == nfaces, f"{len(normals)}가지")

    # 꼭짓점은 전부 외접구 위에.
    radii = [D._len(v) for v in verts]
    check(f"d{sides} 꼭짓점이 외접구 위", max(radii) - min(radii) < 1e-9,
          f"편차 {max(radii) - min(radii):.2e}")

    # 둘레 순서가 틀리면 폴리곤이 나비처럼 접힌다. 면을 제 평면에 눕혀
    # 이웃한 변의 외적 부호가 한결같은지 본다 ─ 볼록한 면이니 한 방향으로만
    # 꺾여야 한다. (각도로 재면 atan2 가 ±π 에서 끊겨 헛짚는다.)
    for f in faces[:3]:
        n = D._face_normal(verts, f)
        m = (0.0, 0.0, 0.0)
        for i in f:
            m = D._add(m, verts[i])
        m = D._mul(m, 1 / len(f))
        e1 = D._norm(D._sub(verts[f[0]], m))
        e2 = D._cross(n, e1)
        flat = [(D._dot(D._sub(verts[i], m), e1), D._dot(D._sub(verts[i], m), e2))
                for i in f]
        turns = []
        for k in range(len(flat)):
            a, b, c = flat[k], flat[(k + 1) % len(flat)], flat[(k + 2) % len(flat)]
            turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0)
        check(f"d{sides} 면이 접히지 않음", all(turns) or not any(turns), str(turns))

# ── 그림 ────────────────────────────────────────────────
section("SVG")

svg = D.render(20, 17, "onyx", size=160, seed=1)

check("SVG 로 시작", svg.startswith("<svg"), svg[:20])
check("SVG 로 끝", svg.rstrip().endswith("</svg>"))
check("media type 에 맞는 네임스페이스", 'xmlns="http://www.w3.org/2000/svg"' in svg)

# <img> 안에서는 아래 셋이 아예 동작하지 않는다. 들어가 있으면 설계가 틀린 것.
check("스크립트 없음", "<script" not in svg.lower())
check("foreignObject 없음", "foreignobject" not in svg.lower())
# 폰트든 그림이든 밖에서 끌어오면 <img> 문맥에서 통째로 막힌다.
# 네임스페이스 선언만 예외다.
check("외부 자원 없음",
      "http" not in svg.replace('xmlns="http://www.w3.org/2000/svg"', ""))

check("면 20장", svg.count("<polygon") == 20, f"{svg.count('<polygon')}장")
check("면마다 좌표·색·가시성 애니메이션", svg.count("<animate ") == 20 * 3 + 1,
      f"{svg.count('<animate ')}개")
check("던져 올리는 호", "animateTransform" in svg)

# 결과가 굴리기 전에 새면 굴리는 의미가 없다.
head = svg[:svg.index("<text")]
check("굴리는 동안 결과가 안 보임", ">17<" not in head)
check("결과는 마지막에 한 번", svg.count(">17<") == 1)

# 같은 씨앗이면 같은 그림이어야 캐시가 성립한다.
check("씨앗이 같으면 같은 그림", D.render(20, 17, "onyx", size=160, seed=1) == svg)
check("씨앗이 다르면 다른 그림", D.render(20, 17, "onyx", size=160, seed=2) != svg)

for name in D.MATERIALS:
    out = D.render(12, 11, name, size=100, seed=3)
    check(f"재질 {name}", out.count("<polygon") == 12 and "#" in out)

tens, units = D.percentile(62, size=100, seed=4)
check("백분율 62 → 십의 자리 60", ">60<" in tens)
check("백분율 62 → 일의 자리 2", ">2<" in units)
tens, units = D.percentile(100, size=100, seed=4)
check("백분율 100 → 00 + 0", ">00<" in tens and ">0<" in units)

try:
    D.render(7, 1)
    check("없는 주사위는 거부", False, "d7 이 통과했다")
except ValueError:
    check("없는 주사위는 거부", True)

# 색 변환이 맞아야 면이 제 밝기로 나온다.
check("hsl 변환: 검정", D._hsl(0, 0, 0) == "#000000", D._hsl(0, 0, 0))
check("hsl 변환: 흰색", D._hsl(0, 0, 100) == "#ffffff", D._hsl(0, 0, 100))
check("hsl 변환: 빨강", D._hsl(0, 100, 50) == "#ff0000", D._hsl(0, 100, 50))

passed = sum(1 for ok, _, _ in results if ok)
failed = [(l, d) for ok, l, d in results if not ok]
print(f"\n{passed}/{len(results)} 통과")
for label, detail in failed:
    print(f"  FAIL: {label}  {detail}")
sys.exit(0 if not failed else 1)
