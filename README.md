# 주사위

CSS 3D 변환만으로 실제로 굴러가는 다면체 주사위입니다.
라이브러리도, 빌드 과정도, 캔버스도 필요 없습니다. `dice.css`와 `dice.js` 두 파일이면 됩니다.

지원하는 주사위: d4 · d6 · d8 · d10 · d12 · d20 · d100(d10 두 개) · 4dF(퍼지 주사위)

쓰는 곳에 따라 세 가지 형태가 있습니다.

| | 형태 | 이럴 때 |
|---|---|---|
| **[web/dice.js](web/dice.js)** | 웹 위젯 | 웹 페이지에 태그 두 줄로 붙일 때 |
| **[svg/dicesvg.py](svg/dicesvg.py)** | 서버에서 만드는 SVG | 자바스크립트를 실행할 수 없는 곳 |
| **[overlay/](overlay/)** | 윈도우 오버레이 앱 | 다른 프로그램 위에 띄워 놓고 굴릴 때 |

---

## 웹 위젯

```html
<link rel="stylesheet" href="dice.css">
<script src="dice.js"></script>
```

```js
document.body.append(Dice.d20(17));           // 17이 나오게 굴림
document.body.append(Dice.of(12, 9));         // 면 수로 지정해도 됨
document.body.append(...Dice.percentile(73)); // d10 두 개
```

**굴림 결과는 호출하는 쪽에서 정합니다.** `dice.js`는 난수를 만들지 않습니다.
값을 넘기면 주사위가 굴러가다가 그 값에서 멈추고, 굴러가는 동안에는 숫자가 보이지 않습니다.
결과가 미리 보이면 굴리는 의미가 없으니까요.

일부러 이렇게 설계했습니다. 판정은 서버나 규칙 코드가 맡고 주사위는 결과를 보여 주기만 해야,
누가 화면 쪽 코드를 고쳐도 굴림 결과를 조작할 수 없습니다.

```js
Dice.d4(v, o)  Dice.d6(v, o)  Dice.d8(v, o)
Dice.d10(v, o) Dice.d12(v, o) Dice.d20(v, o)

Dice.of(sides, value, o)     // sides는 Dice.SIDES 중 하나
Dice.percentile(value, o)    // 주사위 두 개를 배열로 반환

o = {
  size:     픽셀 크기 (기본값 48),
  material: Dice.MATERIALS 중 하나,
  band:     d10 전용, "units"(일의 자리) 또는 "tens"(십의 자리),
}
```

재질(`Dice.MATERIALS`)은 흑요석 `mat-onyx`, 대리석 `mat-marble`, 강철 `mat-steel`,
상아 `mat-ivory`, 네온 `mat-neon`, 참나무 `mat-oak` 여섯 가지입니다.

`Dice.d6`에 `＋`, `０`, `－`를 넘기면 퍼지 주사위가 됩니다.

성공·실패 색(`tone-good`, `tone-bad`)은 사용하는 쪽에서 붙입니다.
성공을 초록색으로 보여 줄지는 규칙이 정할 문제라서 `dice.js`는 이 클래스를 건드리지 않습니다.

[web/demo.html](web/demo.html)을 열면 주사위 여섯 종류와 재질 여섯 가지를 모두 볼 수 있습니다.

### 구현 메모

- 회전은 축 하나로만 합니다(`rotate3d`). X·Y·Z 회전을 따로 보간하면 짐벌 현상 때문에
  구르는 게 아니라 비틀리는 것처럼 보입니다.
- 감속은 타이밍 함수 대신 키프레임 간격으로 표현했습니다(`1-(1-t)²`).
  구간마다 `cubic-bezier`를 걸면 구간이 바뀌는 지점에서 움직임이 끊깁니다.
- 회전축, 튀는 높이, 시간, 지연을 주사위마다 따로 정합니다. 여러 개를 굴려도 제각각 움직입니다.
- **`@keyframes`에 `opacity`를 넣으면 안 됩니다.** `opacity`가 1보다 작으면
  `transform-style: preserve-3d`가 `flat`으로 바뀌어 입체가 통째로 납작해집니다.
  에러 없이 조용히 깨지는 문제라 코드 주석에도 적어 두었습니다.

---

## 서버에서 만드는 SVG

`<img>`로 불러온 SVG, 다른 사이트에 끼워 넣는 HTML 조각, 이메일처럼 스크립트를 실행할 수 없는 곳에서는
서버에서 그림을 완성해서 보내야 합니다.

```python
from dicesvg import render, percentile

svg = render(20, 17)                 # SVG 문자열
tens, units = percentile(73)
```

애니메이션은 SMIL(`<animate>`)이라 자바스크립트 없이도 굴러갑니다.
주사위는 볼록 다면체라서 깊이 정렬 없이 뒷면만 걸러 내면 됩니다.

```
render(sides, value, material="onyx", size=160,
       frames=22, turns=2, duration=1.25, seed=None)
```

`seed`를 지정하면 입력이 같을 때 항상 같은 SVG가 나오므로 URL 단위로 캐시할 수 있습니다.
크기는 d20 기준 36KB(gzip 5.6KB)입니다.

```bash
python svg/test.py     # 기하 불변식 테스트 81개
```

SVG 쪽 기하는 `dice.js`와 별도로 구현되어 있어서 둘이 어긋날 수 있습니다.
그래서 브라우저에서 눈으로 확인하던 것과 **같은 불변식**을 테스트로 검사합니다.

---

## 윈도우 오버레이

알약 모양의 작은 창 하나로, 어떤 프로그램 위에서든 주사위를 굴릴 수 있습니다.
테두리가 없어서 알약 모양 자체가 창입니다.

```bash
python -m pip install -r overlay/requirements.txt
python overlay/build.py
```

`build.py`가 실행 파일로 빌드해서 `%LOCALAPPDATA%\Programs\주사위\`에 설치하고,
바탕화면과 시작 메뉴에 바로 가기를 만듭니다. 설치한 뒤에는 파이썬도 이 저장소도 필요 없습니다.
화면은 윈도우에 기본으로 들어 있는 WebView2로 그립니다.

- **드래그**하면 창이 움직입니다. 주사위를 잡고 끌어도 됩니다.
- **클릭**하면 굴러갑니다. 드래그인지 클릭인지는 마우스가 움직인 거리로 구분합니다.
- 결과 **숫자에 마우스를 올리면** 계산 과정이 보입니다(`1 - 6 = -5`).
  창이 길어지지 않도록 평소에는 결과만 표시합니다.
- 오른쪽 동그란 버튼을 누르면 설정이 열립니다. 주사위 종류, 목표값, 수정치, 수정치 주사위,
  재질, 크기, 불투명도를 바꾸고 굴림 기록을 볼 수 있습니다.
- 키보드로도 쓸 수 있습니다. **1**, **Space**, **Enter**로 굴립니다. **2**를 누르면 d100으로, d100에서 다시 누르면 d20으로 바뀝니다.
  **Esc**는 설정을 닫거나 창을 숨깁니다. 숨긴 창은 바로 가기를 다시 실행하면 나타나고,
  여러 번 실행해도 창은 하나만 뜹니다.
- 알약 바깥은 창이 아니라서, 그 자리를 클릭하면 뒤에 있는 프로그램이 눌립니다.

설정과 굴림 기록은 `%LOCALAPPDATA%\주사위\`에 저장됩니다. 이 폴더를 지우면 처음 상태로 돌아갑니다.

코드를 고치려면 `overlay/main.py` 주석부터 보세요. 창 배경을 투명하게 만드는 방법 두 가지와,
그중 하나를 쓰면 오버레이가 아예 클릭되지 않는 이유를 적어 두었습니다.

요약하면 **WebView2 창에는 `TransparencyKey`를 쓰면 안 됩니다.**
레이어드 윈도우는 레이어 비트맵을 기준으로 클릭할 수 있는 영역을 판정하는데,
WebView2는 DirectComposition으로 따로 그리기 때문에 그 비트맵에 아무것도 남지 않습니다.
그래서 창 전체가 투명 영역으로 처리되어, 화면에는 보이는데 클릭은 되지 않습니다.

---

## 라이선스

[MIT](LICENSE)
