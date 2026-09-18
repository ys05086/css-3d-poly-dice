"""주사위 오버레이.

어디에 얹혀 있든 굴릴 수 있어야 한다 ─ 남의 채팅판이든, 게임 위든.
그래서 창이 아니라 오버레이다. 테두리가 없고, 항상 위에 있고, 트레이에서
접었다 폈다 한다.

화면은 web/overlay.html 이고 주사위는 web/dice.js 가 그린다.
dice.js 는 이 프로그램에 매여 있지 않다 ─ 웹 페이지에 그대로 놓아도 돌고,
여기서는 그걸 창에 얹었을 뿐이다.

윈도우에서는 이미 깔려 있는 WebView2 를 쓴다. 크롬을 따로 받지 않는다.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import sys
import threading
import time
from pathlib import Path


def _root() -> Path:
    """화면 파일이 있는 곳.

    PyInstaller 로 묶으면 web/ 이 임시 폴더에 풀리고 그 경로가 sys._MEIPASS
    로 온다. 개발 중에는 저장소 뿌리다. 두 경우가 여기서만 갈린다.
    """
    packed = getattr(sys, "_MEIPASS", None)
    return Path(packed) if packed else Path(__file__).resolve().parent.parent


ROOT = _root()
PAGE = ROOT / "web" / "overlay.html"

# 설정과 굴린 기록이 사는 곳. 묶어 낸 프로그램은 제 폴더에 쓸 수 없고(읽기
# 전용인 자리에 깔릴 수 있다) 임시 폴더는 껐다 켜면 사라지므로, 사용자
# 몫으로 잡힌 자리에 둔다. pywebview 의 기본값(%APPDATA%\pywebview)은
# 이 PC 의 모든 pywebview 앱이 나눠 쓰는 자리라 쓰지 않는다.
STORE = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "주사위"

# 이미 떠 있는지 알아보고, 떠 있으면 불러내는 데 쓰는 이름들.
# Local\ 은 이 로그온 세션 안에서만 통한다는 뜻이다.
LOCK_NAME = r"Local\dice-overlay"
WAKE_NAME = r"Local\dice-overlay-show"

try:
    import webview
    from PIL import Image, ImageDraw
    import pystray
except ImportError as exc:  # noqa: BLE001
    sys.exit(
        f"필요한 것이 없습니다: {exc.name}\n"
        f"  python -m pip install -r overlay\\requirements.txt"
    )


user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32

ERROR_ALREADY_EXISTS = 183
EVENT_MODIFY_STATE = 0x0002
WAIT_OBJECT_0 = 0

RGN_OR = 2          # CombineRgn: 두 영역을 합친다

# 핸들은 64비트다. ctypes 는 시키지 않으면 반환값을 32비트 int 로 잘라서
# 어쩌다 큰 핸들이 나오는 날 조용히 엉뚱한 걸 가리킨다.
gdi32.CreateRectRgn.restype = wt.HRGN
gdi32.CreateRoundRectRgn.restype = wt.HRGN
gdi32.CombineRgn.argtypes = [wt.HRGN, wt.HRGN, wt.HRGN, ctypes.c_int]
gdi32.DeleteObject.argtypes = [wt.HGDIOBJ]
user32.SetWindowRgn.argtypes = [wt.HWND, wt.HRGN, wt.BOOL]
kernel32.CreateMutexW.restype = wt.HANDLE
kernel32.CreateEventW.restype = wt.HANDLE
kernel32.OpenEventW.restype = wt.HANDLE
kernel32.CloseHandle.argtypes = [wt.HANDLE]
kernel32.SetEvent.argtypes = [wt.HANDLE]
kernel32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]


class Bridge:
    """화면에서 창을 다루는 통로. 창 밖의 일은 전부 여기를 거친다.

    창과 트레이는 반드시 밑줄로 시작하는 이름에 둔다. pywebview 는 이
    객체의 공개 속성을 JS 쪽으로 내보내려고 훑는데, 거기 webview.Window 가
    있으면 .NET 네이티브 객체를 끝없이 파고들다 재귀 한도에서 터진다.
    """

    def __init__(self) -> None:
        self._window: "webview.Window | None" = None
        self._tray: "pystray.Icon | None" = None

    def hide(self) -> None:
        if self._window:
            self._window.hide()

    def show(self) -> None:
        if self._window:
            self._window.show()
            # 숨겼다 부르면 다른 창 뒤에 서 있을 수 있다. 다시 끌어올린다.
            self._window.on_top = True

    def on_top(self, value: bool) -> None:
        if self._window:
            self._window.on_top = bool(value)

    def resize(self, width: int, height: int, shape=None) -> None:
        """설정을 펴고 접을 때 창 자체가 늘었다 줄었다 한다.

        shape 는 화면에서 실제로 뭔가 그려진 자리다. 창은 그보다 넓다 ─
        주사위가 튀어 오를 자리를 위아래로 비워 두기 때문이다. 그 빈 자리를
        창인 채로 두면 오버레이가 아니라 방해물이 되므로 잘라낸다.
        """
        if self._window:
            self._window.resize(int(width), int(height))
        if shape:
            cut_to_shape(self._window, shape)

    def move(self, x: int, y: int) -> None:
        """알약을 잡고 끌 때. 화면이 매 프레임 여기로 새 자리를 보낸다."""
        if self._window:
            self._window.move(int(x), int(y))

    def quit(self) -> None:
        if self._tray:
            self._tray.stop()
        if self._window:
            self._window.destroy()


BRIDGE = Bridge()


class BLURBEHIND(ctypes.Structure):
    _fields_ = [
        ("dwFlags", ctypes.c_uint),
        ("fEnable", ctypes.c_int),
        ("hRgnBlur", wt.HRGN),
        ("fTransitionOnMaximized", ctypes.c_int),
    ]


def clear_background(window) -> None:
    """창 배경을 진짜로 비운다.

    pywebview 는 WebView2 만 투명하게 하고(DefaultBackgroundColor) 창을
    담고 있는 WinForms Form 의 배경은 손대지 않는다. 그래서 웹 화면이
    비어 있는 자리에 Form 의 기본 배경(밝은 회색)이 그대로 드러난다.

    한때 이걸 TransparencyKey 로 막았는데, 그게 오버레이를 통째로
    먹통으로 만들었다. TransparencyKey 는 창을 계층 창(WS_EX_LAYERED)으로
    바꾸고, 윈도우는 계층 창의 적중 판정을 '계층 비트맵' 으로 한다.
    그런데 WebView2 는 DirectComposition 으로 따로 그리기 때문에 그 비트맵에
    들어가지 않는다 ─ 비트맵에는 Form 이 칠한 배경색뿐이고, 그게 곧 키 색이라
    창 전체가 투명으로 판정됐다. 알약은 눈에 보이는데 클릭도 끌기도 전부
    뒤에 있는 창으로 빠져나갔다. (WindowFromPoint 로 확인함.)

    그래서 계층 창을 쓰지 않는다. DWM 에 '이 창은 알파를 그대로 합성해라'
    라고만 일러두고(빈 흐림 영역이 그 뜻이다), Form 배경은 검정으로 칠한다.
    GDI 가 칠한 검정은 알파가 0 이라 그대로 뚫린다. 적중 판정은 평범한
    창과 똑같이 돌아간다.
    """
    try:
        from System import Action
        from System.Drawing import Color
    except ImportError as exc:                    # noqa: BLE001
        print(f"[오버레이] .NET 을 찾지 못했습니다: {exc}")
        return

    form = window.native

    def paint():
        form.BackColor = Color.Black

    try:
        if form.InvokeRequired:
            form.Invoke(Action(paint))            # UI 스레드에서만 만질 수 있다
        else:
            paint()

        bb = BLURBEHIND()
        bb.dwFlags = 0x1 | 0x2                    # ENABLE | BLURREGION
        bb.fEnable = 1
        bb.hRgnBlur = gdi32.CreateRectRgn(0, 0, -1, -1)   # 빈 영역 = 흐림 없이 알파만
        ctypes.windll.dwmapi.DwmEnableBlurBehindWindow(
            int(form.Handle.ToInt64()), ctypes.byref(bb)
        )
    except Exception as exc:                      # noqa: BLE001
        print(f"[오버레이] 배경을 비우지 못했습니다: {exc}")


def cut_to_shape(window, shape) -> None:
    """창을 화면에 그려진 모양대로 오려 낸다.

    창은 알약보다 넓다 ─ 주사위가 튀어 오를 자리를 위아래로 비워 두기
    때문이다. 그 빈 자리는 눈에 보이지 않아도 여전히 창이라서, 그냥 두면
    밑에서 하던 일을 가로막는다. 오버레이가 방해물이 되는 순간이다.

    WS_EX_TRANSPARENT 로 통과시켜 보려 했지만 되지 않았다 ─ 계층 창이
    아니면 그 스타일만으로는 마우스가 지나가지 않는다. 빈 자리를 눌러도
    화면이 그대로 pointerdown 을 받는 걸 확인했다. 그래서 창 자체를
    오려 낸다. 오려 낸 바깥은 '투명한 창' 이 아니라 아예 창이 아니다.

    자르는 선은 계단이 지므로 그림보다 넉넉하게 잡는다(overlay.js 의 pad).
    선이 아무것도 없는 자리를 지나가면 눈에 띄지 않는다.
    """
    if not window:
        return
    try:
        from System import Action
    except ImportError:
        return

    form = window.native
    hwnd = int(form.Handle.ToInt64())
    scale = (user32.GetDpiForWindow(hwnd) or 96) / 96

    def build():
        whole = gdi32.CreateRectRgn(0, 0, 0, 0)
        for part in shape:
            if not part or len(part) != 5:
                continue
            x0, y0, x1, y1, radius = (round(float(v) * scale) for v in part)
            if radius > 0:
                piece = gdi32.CreateRoundRectRgn(
                    x0, y0, x1 + 1, y1 + 1, radius * 2, radius * 2
                )
            else:
                piece = gdi32.CreateRectRgn(x0, y0, x1 + 1, y1 + 1)
            gdi32.CombineRgn(whole, whole, piece, RGN_OR)
            gdi32.DeleteObject(piece)
        # SetWindowRgn 이 영역을 넘겨받는다. 여기서 지우면 안 된다.
        user32.SetWindowRgn(hwnd, whole, True)

    try:
        if form.InvokeRequired:
            form.Invoke(Action(build))
        else:
            build()
    except Exception as exc:                      # noqa: BLE001
        print(f"[오버레이] 창을 오려 내지 못했습니다: {exc}")


def tray_image() -> "Image.Image":
    """트레이 아이콘. 파일을 들고 다니지 않게 코드로 그린다 ─
    육각형(정이십면체를 정면에서 본 실루엣)에 눈 하나."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    r = size * 0.46
    hexagon = [
        (cx + r * (0 if i % 3 == 0 else (0.866 if i in (1, 2) else -0.866)),
         cy + r * (-1 if i == 0 else 1 if i == 3 else (-0.5 if i in (1, 5) else 0.5)))
        for i in range(6)
    ]
    d.polygon(hexagon, fill=(28, 27, 38, 255), outline=(242, 207, 121, 255), width=3)
    d.polygon([(cx, cy - r * 0.55), (cx + r * 0.52, cy + r * 0.42),
               (cx - r * 0.52, cy + r * 0.42)],
              outline=(242, 207, 121, 200), width=2)
    return img


def build_tray() -> "pystray.Icon":
    menu = pystray.Menu(
        pystray.MenuItem("보이기", lambda: BRIDGE.show(), default=True),
        pystray.MenuItem("숨기기", lambda: BRIDGE.hide()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("종료", lambda: BRIDGE.quit()),
    )
    return pystray.Icon("dice-overlay", tray_image(), "주사위", menu)


def corner() -> tuple[int, int]:
    """오른쪽 아래 구석. 매번 화면 한가운데 근처에 뜨면 다른 창에 묻혀
    '어디 갔지' 가 된다. 오버레이는 눈에 걸리는 자리에 있어야 한다."""
    try:
        screen = webview.screens[0]
        return max(0, screen.width - 470), max(0, screen.height - 230)
    except Exception:                             # noqa: BLE001
        return 120, 120


# ── 한 번에 하나만 ──────────────────────────────────────────

def claim() -> "int | None":
    """이 로그온 세션에서 처음 뜬 오버레이면 표를 쥐고, 아니면 None.

    표는 이름 붙은 뮤텍스다. 프로세스가 어떻게 끝나든 ─ 정상 종료든
    강제 종료든 ─ 윈도우가 알아서 거둬 가므로 뒤처리가 필요 없다.

    처음에는 로컬 포트를 썼는데 그게 함정이었다. 먼저 뜬 쪽을 부르고 나면
    받아들인 연결이 TIME_WAIT 로 2분쯤 남고, 그동안은 같은 포트에 다시
    묶이지 않는다. 그래서 오버레이를 끄고 곧바로 다시 켜면 '이미 떠 있다'
    며 조용히 사라졌다. 커널 객체에는 그런 여운이 없다.
    """
    handle = kernel32.CreateMutexW(None, False, LOCK_NAME)
    if not handle:
        return None
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        return None
    return handle


def wake() -> bool:
    """이미 떠 있는 오버레이를 불러낸다. 숨어 있었으면 나온다.

    몇 번 두드리는 이유: 표를 쥐는 것과 부름을 받을 채비가 되는 것 사이에
    아주 짧은 틈이 있다. 그 틈에 두 번째가 들어오면 헛걸음이 된다.
    """
    for _ in range(10):
        handle = kernel32.OpenEventW(EVENT_MODIFY_STATE, False, WAKE_NAME)
        if handle:
            kernel32.SetEvent(handle)
            kernel32.CloseHandle(handle)
            return True
        time.sleep(0.15)
    return False


def answer(stop: threading.Event) -> None:
    """또 실행하면 새 창을 띄우는 대신 있던 걸 꺼내 준다.

    바로가기를 두 번 눌렀다고 알약이 둘로 늘면, 겹쳐 있는 탓에 하나를
    끌어 옮겨도 그대로 남은 것처럼 보인다. 실제로 그렇게 넷까지 쌓여 있었다.
    그리고 숨겨 둔 걸 꺼내는 길이 트레이 하나뿐이면, 트레이 아이콘이
    접혀 있는 날 '어디 갔지' 가 된다. 바로가기를 다시 누르면 나온다.
    """
    handle = kernel32.CreateEventW(None, False, False, WAKE_NAME)   # 자동 복귀
    if not handle:
        return
    try:
        while not stop.is_set():
            if kernel32.WaitForSingleObject(handle, 400) == WAIT_OBJECT_0:
                BRIDGE.show()
    finally:
        kernel32.CloseHandle(handle)


def main() -> None:
    if not PAGE.exists():
        sys.exit(f"화면 파일이 없습니다: {PAGE}")

    held = claim()
    if held is None:
        if wake():
            return                       # 이미 떠 있다. 그쪽을 꺼내 줬다.
        print("[오버레이] 이미 떠 있는 것 같은데 부르지 못했습니다.")
        return

    x, y = corner()

    window = webview.create_window(
        "주사위",
        str(PAGE),
        width=420, height=140,
        x=x, y=y,
        frameless=True,          # 제목줄은 화면이 직접 그린다
        easy_drag=False,         # 끌기는 overlay.js 가 직접 한다
        on_top=True,
        transparent=True,
        resizable=True,
        min_size=(170, 80),
        # 로딩 직전에 잠깐 보이는 색. 비어 있을 자리와 같게 검정으로 둔다.
        background_color="#000000",
        js_api=BRIDGE,
    )
    BRIDGE._window = window

    tray = build_tray()
    BRIDGE._tray = tray
    # 트레이는 따로 돈다. webview.start() 가 주 스레드를 잡기 때문이다.
    threading.Thread(target=tray.run, daemon=True).start()

    stop = threading.Event()
    threading.Thread(target=answer, args=(stop,), daemon=True).start()

    # 창을 닫아도 앱은 살아 있다. 트레이에서 종료해야 끝난다 ─
    # 실수로 X 를 눌렀다고 굴림 기록이 날아가면 안 된다.
    def on_closing() -> bool:
        BRIDGE.hide()
        return False

    def on_shown() -> None:
        clear_background(window)

    window.events.closing += on_closing
    window.events.shown += on_shown
    webview.start(
        gui="edgechromium" if sys.platform == "win32" else None,
        # 설정과 굴린 기록은 화면 쪽 localStorage 에 산다. 이 둘을 주지 않으면
        # pywebview 는 private_mode 가 기본으로 켜져 있어서 뜰 때마다 임시
        # 폴더를 새로 파고, 끄는 순간 다 사라진다 ─ '기록' 칸이 매번 비어
        # 있는 이유가 그것이었다.
        private_mode=False,
        storage_path=str(STORE),
    )

    stop.set()
    kernel32.CloseHandle(held)
    tray.stop()


if __name__ == "__main__":
    main()
