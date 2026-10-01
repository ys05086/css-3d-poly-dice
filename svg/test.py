"""SVG 주사위 테스트.

이 SVG는 스크립트가 실행되지 않는 곳(<img>로 불러온 SVG)에서도 굴러가야 한다.
그런 환경에서는 문제가 생겨도 고칠 방법이 없으니 여기서 미리 걸러야 한다.

특히 기하는 web/dice.js와 별도로 구현되어 있어서 둘이 어긋날 수 있다.
그래서 브라우저에서 확인하는 것과 같은 불변식을 여기서도 검사한다.
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

    # 0번 면이 정면을 향해야 착지했을 때 결과가 보인다.
    n0 = D._face_normal(verts, faces[0])
    check(f"d{sides} 0번 면이 정면(+Z)",
          all(abs(a - b) < 1e-9 for a, b in zip(n0, (0, 0, 1))),
          str(tuple(round(x, 6) for x in n0)))

    # 모든 면의 중심이 원점에서 같은 거리에 있어야 한다.
    # 하나라도 다르면 면 목록이 잘못된 것이다.
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

    # 꼭짓점은 모두 외접구 위에 있어야 한다.
    radii = [D._len(v) for v in verts]
    check(f"d{sides} 꼭짓점이 외접구 위", max(radii) - min(radii) < 1e-9,
          f"편차 {max(radii) - min(radii):.2e}")

    # 둘레 순서가 틀리면 다각형이 나비 모양으로 꼬인다. 면을 그 평면에 펼쳐 놓고
    # 이웃한 변의 외적 부호가 모두 같은지 본다. 볼록한 면이므로 한 방향으로만
    # 꺾여야 한다. (각도로 비교하면 atan2가 ±π에서 끊겨서 잘못 판단한다.)
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

check("<svg>로 시작", svg.startswith("<svg"), svg[:20])
check("</svg>로 끝남", svg.rstrip().endswith("</svg>"))
check("SVG 네임스페이스 선언", 'xmlns="http://www.w3.org/2000/svg"' in svg)

# <img> 안에서는 아래 세 가지가 전혀 동작하지 않는다. 들어 있으면 설계가 잘못된 것이다.
check("스크립트 없음", "<script" not in svg.lower())
check("foreignObject 없음", "foreignobject" not in svg.lower())
# 폰트든 이미지든 외부에서 불러오면 <img> 안에서는 통째로 차단된다.
# 네임스페이스 선언만 예외다.
check("외부 자원 없음",
      "http" not in svg.replace('xmlns="http://www.w3.org/2000/svg"', ""))

check("면 20장", svg.count("<polygon") == 20, f"{svg.count('<polygon')}장")
check("면마다 좌표·색·가시성 애니메이션", svg.count("<animate ") == 20 * 3 + 1,
      f"{svg.count('<animate ')}개")
check("던져 올리는 궤적", "animateTransform" in svg)

# 굴리기 전에 결과가 보이면 굴리는 의미가 없다.
head = svg[:svg.index("<text")]
check("굴리는 동안 결과가 안 보임", ">17<" not in head)
check("결과는 마지막에 한 번", svg.count(">17<") == 1)

# 시드가 같으면 같은 SVG가 나와야 캐시할 수 있다.
check("시드가 같으면 같은 SVG", D.render(20, 17, "onyx", size=160, seed=1) == svg)
check("시드가 다르면 다른 SVG", D.render(20, 17, "onyx", size=160, seed=2) != svg)

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
    check("지원하지 않는 주사위는 거부", False, "d7이 통과함")
except ValueError:
    check("지원하지 않는 주사위는 거부", True)

# 색 변환이 맞아야 면이 올바른 밝기로 나온다.
check("hsl 변환: 검정", D._hsl(0, 0, 0) == "#000000", D._hsl(0, 0, 0))
check("hsl 변환: 흰색", D._hsl(0, 0, 100) == "#ffffff", D._hsl(0, 0, 100))
check("hsl 변환: 빨강", D._hsl(0, 100, 50) == "#ff0000", D._hsl(0, 100, 50))

passed = sum(1 for ok, _, _ in results if ok)
failed = [(l, d) for ok, l, d in results if not ok]
print(f"\n{passed}/{len(results)} 통과")
for label, detail in failed:
    print(f"  FAIL: {label}  {detail}")
sys.exit(0 if not failed else 1)
