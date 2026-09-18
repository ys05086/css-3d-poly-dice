# 주사위

진짜로 굴러가는 3D 다면체 주사위. **의존성 없음, 빌드 없음, 캔버스 없음.**
`dice.css` + `dice.js` 두 파일이 전부고, CSS 3D 변환으로 굴러갑니다.

d4 · d6 · d8 · d10 · d12 · d20 · d100(십면체 두 알) · 4dF(퍼지)

세 가지 모습으로 쓸 수 있습니다.

| | 무엇 | 쓰는 곳 |
|---|---|---|
| **[web/dice.js](web/dice.js)** | 웹 위젯 | 아무 페이지에나 `<script>` 두 줄 |
| **[svg/dicesvg.py](svg/dicesvg.py)** | 서버에서 그린 SVG | 스크립트가 못 도는 자리 |
| **[overlay/](overlay/)** | 윈도우 오버레이 프로그램 | 무엇 위에서든 |

---

## 웹 위젯

```html
<link rel="stylesheet" href="dice.css">
<script src="dice.js"></script>
```

```js
document.body.append(Dice.d20(17));           // 17 이 나오도록 굴린다
document.body.append(Dice.of(12, 9));         // 면 수로 골라도 된다
document.body.append(...Dice.percentile(73)); // 십면체 두 알
```

**굴림 결과는 부르는 쪽이 정합니다.** `dice.js` 는 난수를 만들지 않습니다.
값을 넘기면 주사위가 굴러가다가 그 값에서 멈춥니다 — 굴리는 동안에는 아무
숫자도 보이지 않습니다. 결과가 미리 새면 굴리는 의미가 없으니까요.

이건 취향이 아니라 구조입니다. 판정은 서버나 규칙 코드가 하고 주사위는
그걸 보여 주기만 해야, 화면을 뜯어고쳐도 굴림을 조작할 수 없습니다.

```js
Dice.d4(v, o)  Dice.d6(v, o)  Dice.d8(v, o)
Dice.d10(v, o) Dice.d12(v, o) Dice.d20(v, o)

Dice.of(sides, value, o)     // sides ∈ Dice.SIDES
Dice.percentile(value, o)    // 두 알을 배열로 돌려준다

o = {
  size:     픽셀 (기본 48),
  material: Dice.MATERIALS 중 하나,
  band:     d10 전용 — "units" | "tens",
}
```

`Dice.MATERIALS` — 흑요석 `mat-onyx` · 대리석 `mat-marble` · 강철 `mat-steel` ·
상아 `mat-ivory` · 네온 `mat-neon` · 참나무 `mat-oak`.

`Dice.d6` 에 `＋ ０ －` 를 넘기면 퍼지 주사위가 됩니다.

결과 색(`tone-good` / `tone-bad`)은 붙이는 쪽 몫입니다. `dice.js` 는 그 클래스를
건드리지 않습니다 — 성공을 초록으로 칠할지는 규칙이 정할 일이지 주사위가
정할 일이 아닙니다.

[web/demo.html](web/demo.html) 을 열면 여섯 종류와 여섯 재질이 다 나옵니다.

### 굴러가는 방식

- 한 축으로만 돕니다(`rotate3d`). 축 셋을 따로 보간하면 짐벌이 흔들려
  구르는 게 아니라 비틀리는 것처럼 보입니다.
- 감속은 타이밍 함수가 아니라 키프레임 간격에 넣었습니다(`1-(1-t)²`).
  구간마다 `cubic-bezier` 를 주면 이음매에서 딱딱 끊깁니다.
- 축·높이·시간·지연이 알마다 다릅니다. 여럿을 굴리면 따로 놉니다.
- **`@keyframes` 에 `opacity` 를 넣으면 안 됩니다.** `opacity < 1` 은
  `transform-style: preserve-3d` 를 `flat` 으로 되돌려서, 입체가 통째로
  납작해집니다. 눈에 띄지 않게 망가지는 종류라 코드에 못박아 뒀습니다.

---

## 서버에서 그린 SVG

스크립트가 못 도는 자리가 있습니다 — `<img>` 로 불린 SVG, 남의 사이트에
끼워 넣는 조각, 메일. 거기서는 고칠 방법이 없으니 다 서버에서 끝내야 합니다.

```python
from dicesvg import render, percentile

svg = render(20, 17)                 # 문자열 하나
tens, units = percentile(73)
```

SMIL(`<animate>`)로 굴러가므로 자바스크립트가 한 줄도 없어도 돕니다.
볼록한 다면체라 깊이 정렬이 필요 없고 뒷면만 걷어내면 됩니다.

```
render(sides, value, material="onyx", size=160,
       frames=22, turns=2, duration=1.25, seed=None)
```

`seed` 를 주면 같은 입력이 같은 그림을 냅니다 — 주소를 캐시에 올릴 수 있습니다.
d20 이 36KB, gzip 5.6KB 입니다.

```bash
python svg/test.py     # 기하 불변식 81개
```

기하가 `dice.js` 와 따로 구현되어 있어 어긋날 수 있습니다. 그래서 브라우저에서
눈으로 확인하는 것과 **같은 불변식**을 시험으로 잽니다.

---

## 윈도우 오버레이

무엇 위에서든 굴릴 수 있는 알약 하나. 창틀이 없고 알약이 곧 창입니다.

```bash
python -m pip install -r overlay/requirements.txt
python overlay/build.py
```

묶어서 `%LOCALAPPDATA%\Programs\주사위\` 에 깔고 바탕화면·시작 메뉴에
바로가기를 놓습니다. 깔고 나면 파이썬도 이 저장소도 필요 없습니다 —
화면은 윈도우에 이미 들어 있는 WebView2 를 씁니다.

- **잡고 끌면** 옮겨집니다. 주사위를 잡고 끌어도 됩니다.
- **톡 누르면** 굴러갑니다. 끌었는지 눌렀는지는 움직인 거리로 가릅니다.
- 오른쪽 동그라미가 설정 — 주사위 종류, 목표, 수정치, 수정치 주사위,
  재질, 크기, 불투명도, 굴린 기록.
- **1 · 2** 키로도 굴리고 **Esc** 로 숨깁니다. 숨겼으면 바로가기를 다시
  누르면 나옵니다. 두 번 눌러도 알약이 둘로 늘지 않습니다.
- 알약 바깥은 창이 아니라서 클릭이 그대로 뒤로 지나갑니다.

설정과 굴린 기록은 `%LOCALAPPDATA%\주사위\` 에 남습니다. 지우면 처음으로 돌아갑니다.

고쳐 쓸 거면 `overlay/main.py` 주석에 배경을 비우는 두 가지 방법과, 그중
하나가 왜 오버레이를 통째로 먹통으로 만드는지 적어 뒀습니다. 요약하면
**WebView2 창에 `TransparencyKey` 를 쓰면 안 됩니다** — 계층 창의 적중 판정은
계층 비트맵으로 하는데 WebView2 는 DirectComposition 으로 따로 그려서 그
비트맵에 들어가지 않고, 결과적으로 창 전체가 투명으로 판정됩니다. 보이는데
눌리지 않습니다.

---

## 라이선스

[MIT](LICENSE).
