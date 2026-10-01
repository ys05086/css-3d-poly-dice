"""주사위 오버레이.

어떤 프로그램 위에서든 주사위를 굴릴 수 있게 하는 것이 목적이다. 그래서
일반 창이 아니라 오버레이로 만들었다. 테두리가 없고, 항상 위에 떠 있고,
트레이 아이콘으로 숨기거나 다시 꺼낼 수 있다.

화면은 web/overlay.html이고 주사위는 web/dice.js가 그린다.
dice.js는 이 프로그램에 의존하지 않는다. 웹 페이지에 그대로 넣어도 동작하고,
여기서는 그것을 창에 띄웠을 뿐이다.

윈도우에 기본으로 설치된 WebView2를 쓰므로 크로미움을 따로 받지 않는다.
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
    """화면 파일이 있는 폴더.

    PyInstaller로 빌드하면 web/이 임시 폴더에 풀리고 그 경로가 sys._MEIPASS로
    들어온다. 개발 중에는 저장소 루트다. 두 경우를 여기서만 구분한다.
    """
    packed = getattr(sys, "_MEIPASS", None)
    return Path(packed) if packed else Path(__file__).resolve().parent.parent


ROOT = _root()
PAGE = ROOT / "web" / "overlay.html"

# 설정과 굴림 기록을 저장하는 위치. 빌드한 프로그램은 자기 폴더에 쓰지 못할
# 수 있고(읽기 전용 위치에 설치될 수 있다) 임시 폴더는 재시작하면 사라지므로,
# 사용자 전용 폴더에 둔다. pywebview 기본값(%APPDATA%\pywebview)은 이 PC의
# 모든 pywebview 앱이 함께 쓰는 위치라서 쓰지 않는다.
STORE = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "주사위"

# 이미 실행 중인지 확인하고, 실행 중이면 그 창을 불러내는 데 쓰는 이름.
# Local\은 현재 로그온 세션 안에서만 유효하다는 뜻이다.
LOCK_NAME = r"Local\dice-overlay"
WAKE_NAME = r"Local\dice-overlay-show"

try:
    import webview
    from PIL import Image, ImageDraw
    import pystray
except ImportError as exc:  # noqa: BLE001
    sys.exit(
        f"필요한 패키지가 없습니다: {exc.name}\n"
        f"  python -m pip install -r overlay\\requirements.txt"
    )


user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32

ERROR_ALREADY_EXISTS = 183
EVENT_MODIFY_STATE = 0x0002
WAIT_OBJECT_0 = 0

RGN_OR = 2          # CombineRgn: 두 영역을 합친다

# 핸들은 64비트다. ctypes는 따로 지정하지 않으면 반환값을 32비트 int로 잘라서,
# 큰 핸들 값이 나오면 오류 없이 엉뚱한 객체를 가리키게 된다.
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
    """화면(JS)에서 창을 제어하는 통로. 창과 관련된 일은 모두 여기를 거친다.

    창과 트레이 객체는 반드시 밑줄로 시작하는 속성에 둔다. pywebview는 이
    객체의 공개 속성을 JS 쪽에 노출하려고 탐색하는데, 거기에 webview.Window가
    있으면 .NET 네이티브 객체를 끝없이 따라 들어가다 재귀 한도를 넘겨 실패한다.
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
            # 숨겼다가 다시 보이면 다른 창 뒤에 있을 수 있으므로 맨 위로 올린다.
            self._window.on_top = True

    def on_top(self, value: bool) -> None:
        if self._window:
            self._window.on_top = bool(value)

    def resize(self, width: int, height: int, shape=None) -> None:
        """설정을 열고 닫을 때 창 크기를 바꾼다.

        shape는 화면에서 실제로 무언가 그려진 영역이다. 창은 그보다 넓은데,
        주사위가 튀어 오를 공간을 위아래로 비워 두기 때문이다. 그 빈 공간까지
        창으로 남겨 두면 아래에 있는 프로그램을 가리므로 잘라 낸다.
        """
        if self._window:
            self._window.resize(int(width), int(height))
        if shape:
            cut_to_shape(self._window, shape)

    def move(self, x: int, y: int) -> None:
        """알약을 드래그할 때 화면이 매 프레임 새 위치를 보낸다."""
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
    """창 배경을 실제로 투명하게 만든다.

    pywebview는 WebView2만 투명하게 하고(DefaultBackgroundColor), 그것을 감싼
    WinForms Form의 배경은 그대로 둔다. 그래서 웹 화면이 비어 있는 곳에
    Form의 기본 배경(밝은 회색)이 드러난다.

    처음에는 TransparencyKey로 해결했는데, 그러자 오버레이가 아예 클릭되지
    않았다. TransparencyKey는 창을 레이어드 윈도우(WS_EX_LAYERED)로 바꾸고,
    윈도우는 레이어드 윈도우의 클릭 영역을 레이어 비트맵으로 판정한다.
    그런데 WebView2는 DirectComposition으로 따로 그리기 때문에 그 비트맵에
    포함되지 않는다. 비트맵에는 Form이 칠한 배경색만 남고 그게 곧 투명 키
    색이라서, 창 전체가 투명 영역으로 판정됐다. 알약은 화면에 보이는데 클릭과
    드래그가 모두 뒤에 있는 창으로 넘어갔다. (WindowFromPoint로 확인했다.)

    그래서 레이어드 윈도우를 쓰지 않는다. DWM에 이 창의 알파 채널을 그대로
    합성하라고 알려 주고(빈 블러 영역이 그런 뜻이다), Form 배경은 검정으로
    칠한다. GDI가 칠한 검정은 알파가 0이라 투명하게 비친다. 클릭 판정은
    일반 창과 똑같이 동작한다.
    """
    try:
        from System import Action
        from System.Drawing import Color
    except ImportError as exc:                    # noqa: BLE001
        print(f"[오버레이] .NET을 찾지 못했습니다: {exc}")
        return

    form = window.native

    def paint():
        form.BackColor = Color.Black

    try:
        if form.InvokeRequired:
            form.Invoke(Action(paint))            # UI 스레드에서만 바꿀 수 있다
        else:
            paint()

        bb = BLURBEHIND()
        bb.dwFlags = 0x1 | 0x2                    # ENABLE | BLURREGION
        bb.fEnable = 1
        bb.hRgnBlur = gdi32.CreateRectRgn(0, 0, -1, -1)   # 빈 영역 = 블러 없이 알파만
        ctypes.windll.dwmapi.DwmEnableBlurBehindWindow(
            int(form.Handle.ToInt64()), ctypes.byref(bb)
        )
    except Exception as exc:                      # noqa: BLE001
        print(f"[오버레이] 배경을 투명하게 만들지 못했습니다: {exc}")


def cut_to_shape(window, shape) -> None:
    """창을 화면에 그려진 모양대로 잘라 낸다.

    창은 알약보다 넓다. 주사위가 튀어 오를 공간을 위아래로 비워 두기
    때문이다. 그 빈 공간은 눈에 보이지 않아도 여전히 창이라서, 그대로 두면
    아래에 있는 프로그램을 클릭할 수 없다.

    WS_EX_TRANSPARENT로 클릭을 통과시켜 보려 했지만 되지 않았다. 레이어드
    윈도우가 아니면 이 스타일만으로는 마우스 입력이 통과하지 않는다. 빈 곳을
    클릭해도 화면이 pointerdown을 그대로 받는 것을 확인했다. 그래서 창 자체를
    잘라 낸다. 잘라 낸 바깥은 투명한 창이 아니라 아예 창이 아니게 된다.

    자르는 경계선은 계단처럼 각지므로 그림보다 여유 있게 잡는다(overlay.js의
    pad). 경계선이 빈 곳을 지나가면 눈에 띄지 않는다.
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
        # SetWindowRgn이 영역의 소유권을 가져간다. 여기서 해제하면 안 된다.
        user32.SetWindowRgn(hwnd, whole, True)

    try:
        if form.InvokeRequired:
            form.Invoke(Action(build))
        else:
            build()
    except Exception as exc:                      # noqa: BLE001
        print(f"[오버레이] 창 모양을 잘라 내지 못했습니다: {exc}")


def tray_image() -> "Image.Image":
    """트레이 아이콘. 별도 이미지 파일 없이 코드로 그린다.
    정이십면체를 정면에서 본 육각형 실루엣 안에 삼각형 면 하나를 넣는다."""
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
    """화면 오른쪽 아래 구석 좌표. 매번 화면 가운데쯤 뜨면 다른 창에 가려
    찾기 어렵다. 오버레이는 눈에 잘 띄는 곳에 있어야 한다."""
    try:
        screen = webview.screens[0]
        return max(0, screen.width - 470), max(0, screen.height - 230)
    except Exception:                             # noqa: BLE001
        return 120, 120


# ── 중복 실행 방지 ──────────────────────────────────────────

def claim() -> "int | None":
    """현재 로그온 세션에서 처음 실행된 오버레이면 뮤텍스 핸들을, 아니면 None을 반환한다.

    이름 있는 뮤텍스를 쓰면 프로세스가 정상 종료하든 강제 종료되든 윈도우가
    알아서 정리하므로 따로 뒷정리할 필요가 없다.

    처음에는 로컬 포트를 썼는데 문제가 있었다. 기존 인스턴스를 불러낸 뒤
    그 연결이 TIME_WAIT 상태로 2분쯤 남아서, 그동안 같은 포트를 다시 쓸 수
    없었다. 그래서 오버레이를 끄고 바로 다시 켜면 이미 실행 중이라고 판단하고
    아무 창도 띄우지 않았다. 커널 객체에는 이런 문제가 없다.
    """
    handle = kernel32.CreateMutexW(None, False, LOCK_NAME)
    if not handle:
        return None
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        return None
    return handle


def wake() -> bool:
    """이미 실행 중인 오버레이를 불러낸다. 숨겨져 있었다면 다시 보인다.

    여러 번 시도하는 이유: 뮤텍스를 잡은 시점과 호출을 받을 준비가 끝난
    시점 사이에 아주 짧은 틈이 있다. 그 사이에 두 번째 실행이 들어오면
    이벤트를 찾지 못한다.
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
    """다시 실행하면 새 창을 띄우는 대신 기존 창을 보여 준다.

    바로 가기를 두 번 실행했다고 알약이 두 개가 되면, 겹쳐 있어서 하나를
    옮겨도 원래 자리에 그대로 있는 것처럼 보인다. 실제로 네 개까지 쌓인
    적이 있다. 또 숨긴 창을 꺼내는 방법이 트레이뿐이면, 트레이 아이콘이
    숨겨져 있을 때 찾을 수 없다. 그래서 바로 가기를 다시 실행하면 나타나게 했다.
    """
    handle = kernel32.CreateEventW(None, False, False, WAKE_NAME)   # 자동 리셋
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
            return                       # 이미 실행 중인 창을 불러냈다.
        print("[오버레이] 이미 실행 중인 것 같지만 불러내지 못했습니다.")
        return

    x, y = corner()

    window = webview.create_window(
        "주사위",
        str(PAGE),
        width=420, height=140,
        x=x, y=y,
        frameless=True,          # 제목 표시줄 없이 화면이 직접 그린다
        easy_drag=False,         # 드래그는 overlay.js가 직접 처리한다
        on_top=True,
        transparent=True,
        resizable=True,
        min_size=(170, 80),
        # 로딩 직전 잠깐 보이는 배경색. 투명하게 비울 영역과 같은 검정으로 둔다.
        background_color="#000000",
        js_api=BRIDGE,
    )
    BRIDGE._window = window

    tray = build_tray()
    BRIDGE._tray = tray
    # 트레이는 별도 스레드에서 돌린다. webview.start()가 메인 스레드를 점유하기 때문이다.
    threading.Thread(target=tray.run, daemon=True).start()

    stop = threading.Event()
    threading.Thread(target=answer, args=(stop,), daemon=True).start()

    # 창을 닫아도 앱은 종료되지 않고 숨기만 한다. 종료는 트레이 메뉴에서 한다.
    # 실수로 X를 눌러 앱이 꺼지지 않게 하기 위해서다.
    def on_closing() -> bool:
        BRIDGE.hide()
        return False

    def on_shown() -> None:
        clear_background(window)

    window.events.closing += on_closing
    window.events.shown += on_shown
    webview.start(
        gui="edgechromium" if sys.platform == "win32" else None,
        # 설정과 굴림 기록은 화면 쪽 localStorage에 저장된다. 아래 두 값을 주지
        # 않으면 pywebview는 private_mode가 기본으로 켜져 있어서 실행할 때마다 임시
        # 폴더를 새로 만들고, 종료하면 모두 지운다. 기록이 매번 비어 있던 원인이다.
        private_mode=False,
        storage_path=str(STORE),
    )

    stop.set()
    kernel32.CloseHandle(held)
    tray.stop()


if __name__ == "__main__":
    main()
