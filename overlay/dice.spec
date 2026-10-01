# -*- mode: python ; coding: utf-8 -*-
"""주사위 오버레이를 독립 실행 프로그램으로 빌드하는 설정.

    python overlay\\build.py

결과물은 dist/주사위/ 폴더 하나다. 폴더째 옮겨도 실행된다.
파이썬, 가상 환경, 이 저장소 모두 필요 없다. 화면(WebView2)만은 윈도우에
기본으로 들어 있는 것을 쓴다.

단일 파일(onefile)로 빌드하지 않는 이유: pythonnet은 실행 중에 .NET
어셈블리를 찾아 불러오는데, 실행할 때마다 임시 폴더에 풀었다가 지우는
방식과 잘 맞지 않는다. 또 폴더 방식이 눈에 띄게 빨리 실행된다. 트레이에
상주하는 프로그램이라 실행 속도가 사용감에 큰 영향을 준다.
"""
from pathlib import Path

ROOT = Path(SPECPATH).parent          # noqa: F821  (SPECPATH는 PyInstaller가 넣어 준다)

# 빌드한 뒤에도 파일 배치가 그대로여야 한다. pywebview는 화면 파일이 있는 폴더를
# 루트로 삼아 내장 HTTP 서버로 제공하므로, 주사위 파일이 같은 폴더에 없으면
# 404가 나서 주사위 없이 빈 알약만 남는다.
# 빌드한 뒤에는 main.py의 _root()가 이 'web' 폴더를 가리킨다.
PAGE = ["overlay.html", "overlay.css", "overlay.js", "dice.css", "dice.js"]

a = Analysis(                                                    # noqa: F821
    [str(ROOT / "overlay" / "main.py")],
    pathex=[],
    binaries=[],
    datas=[(str(ROOT / "web" / name), "web") for name in PAGE],
    # pystray는 사용할 백엔드를 실행 중에 고른다. 정적 분석으로는 찾을 수 없다.
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
    console=False,          # 트레이에 상주하는 프로그램이라 콘솔 창을 띄우지 않는다.
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
