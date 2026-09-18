# -*- mode: python ; coding: utf-8 -*-
"""주사위 오버레이를 혼자 도는 프로그램으로 묶는다.

    python overlay\\build.py

만들어지는 것은 dist/주사위/ 한 폴더다. 통째로 옮겨도 돌아간다 ─
파이썬도, 가상환경도, 이 저장소도 필요 없다. 화면(WebView2)만은 윈도우에
이미 들어 있는 걸 쓴다.

한 파일(onefile)로 묶지 않는 이유: pythonnet 이 .NET 어셈블리를 실행 중에
찾아 올리는데, 매번 임시 폴더에 풀었다 지우는 방식과 잘 맞지 않는다.
그리고 폴더 쪽이 뜨는 속도가 눈에 띄게 빠르다 ─ 트레이에 얹어 두는
프로그램이라 뜨는 속도가 곧 인상이다.
"""
from pathlib import Path

ROOT = Path(SPECPATH).parent          # noqa: F821  ─ SPECPATH 는 PyInstaller 가 넣어 준다

# 묶인 안에서도 자리가 그대로여야 한다. pywebview 는 화면 파일이 있는 폴더를
# 뿌리로 삼아 제 HTTP 서버로 내려주므로, 주사위가 같은 폴더에 없으면
# 404 로 빠지고 알약만 덩그러니 남는다.
# main.py 의 _root() 가 묶인 뒤에는 이 'web' 을 바라본다.
PAGE = ["overlay.html", "overlay.css", "overlay.js", "dice.css", "dice.js"]

a = Analysis(                                                    # noqa: F821
    [str(ROOT / "overlay" / "main.py")],
    pathex=[],
    binaries=[],
    datas=[(str(ROOT / "web" / name), "web") for name in PAGE],
    # pystray 는 쓸 뒤판을 실행 중에 고른다. 훑어서는 안 보인다.
    hiddenimports=["pystray._win32"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # 오버레이에 필요 없는 패키지가 딸려 들어오지 않게 한다.
        "tkinter", "pytest", "numpy",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)                                                # noqa: F821

exe = EXE(                                                       # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="주사위",
    debug=False,
    strip=False,
    upx=False,
    console=False,          # 트레이에 사는 프로그램이다. 검은 창이 뜨면 안 된다.
    icon=str(ROOT / "overlay" / "dice.ico"),
)
coll = COLLECT(                                                  # noqa: F821
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="주사위",
)
