"""오버레이를 독립 실행 프로그램으로 빌드하고 설치한다.

    python overlay\\build.py

하는 일은 세 가지다.
  1. PyInstaller로 dist/주사위/를 만든다(overlay/dice.spec).
  2. 그 폴더를 %LOCALAPPDATA%\\Programs\\주사위\\로 옮긴다.
  3. 바탕화면과 시작 메뉴에 바로 가기를 만든다.

2번이 필요한 이유: dist/는 빌드 결과물을 두는 임시 폴더라서 --clean으로
다시 빌드할 때 통째로 지워진다. 매일 쓰는 프로그램을 거기 둘 수는 없다.
윈도우에서 사용자 단위로 설치하는 프로그램은 %LOCALAPPDATA%\\Programs에 둔다.

설치한 뒤에는 이 저장소나 가상 환경이 없어도 실행된다. 화면(WebView2)은
윈도우에 기본으로 들어 있는 것을 쓴다.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "overlay" / "dice.spec"
NAME = "주사위"
BUILT = ROOT / "dist" / NAME
HOME = Path(os.environ["LOCALAPPDATA"]) / "Programs" / NAME


def build() -> None:
    exe = ROOT / ".venv" / "Scripts" / "pyinstaller.exe"
    cmd = [str(exe)] if exe.exists() else [sys.executable, "-m", "PyInstaller"]
    print("빌드 중…")
    # PyInstaller는 진행 상황을 stderr로 잔뜩 출력한다. 성공하면 볼 필요가 없다.
    done = subprocess.run([*cmd, str(SPEC), "--noconfirm", "--clean"], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8",
                          errors="replace")
    if done.returncode != 0:
        print(done.stderr[-4000:])
        raise SystemExit("빌드에 실패했습니다.")
    if not (BUILT / f"{NAME}.exe").exists():
        raise SystemExit(f"실행 파일이 만들어지지 않았습니다: {BUILT}")


def install() -> Path:
    """기존 설치 폴더를 지우고 새로 복사한다.

    프로그램이 실행 중이면 exe를 덮어쓸 수 없다. 그럴 때는 트레이에서 먼저
    종료하라고 안내한다. 조용히 실패해서 이전 버전이 남아 있는 게 가장 나쁘다.
    """
    HOME.parent.mkdir(parents=True, exist_ok=True)
    if HOME.exists():
        try:
            shutil.rmtree(HOME)
        except PermissionError:
            raise SystemExit(
                f"실행 중이라 지울 수 없습니다: {HOME}\n"
                f"  트레이의 주사위 아이콘에서 '종료'를 누른 뒤 다시 실행해 주세요."
            )
    shutil.copytree(BUILT, HOME)
    return HOME / f"{NAME}.exe"


def shortcuts(target: Path) -> list[str]:
    """바탕화면과 시작 메뉴에 바로 가기를 만든다(이미 있으면 갱신한다)."""
    # 파워셸이 한글 경로를 출력한다. 콘솔 코드 페이지에 맡기면 글자가 깨지므로 UTF-8로 고정한다.
    script = f"""
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$sh = New-Object -ComObject WScript.Shell
$spots = @(
  [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '{NAME}.lnk'),
  [IO.Path]::Combine([Environment]::GetFolderPath('StartMenu'), 'Programs', '{NAME}.lnk')
)
foreach ($spot in $spots) {{
  $lnk = $sh.CreateShortcut($spot)
  $lnk.TargetPath = '{target}'
  $lnk.WorkingDirectory = '{target.parent}'
  $lnk.IconLocation = '{target},0'
  $lnk.Description = '주사위 오버레이'
  $lnk.Save()
  Write-Output $spot
}}
"""
    out = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if out.returncode != 0:
        print("바로 가기를 만들지 못했습니다:", out.stderr.strip())
        return []
    return [line for line in out.stdout.splitlines() if line.strip()]


def main() -> None:
    # 한글 경로를 출력하다가 콘솔 코드 페이지 때문에 오류가 나지 않게 한다.
    sys.stdout.reconfigure(errors="replace")
    build()
    target = install()
    size = sum(f.stat().st_size for f in HOME.rglob("*") if f.is_file())
    print(f"설치했습니다: {target}  ({size / 1024 / 1024:.0f}MB)")
    for spot in shortcuts(target):
        print(f"  바로 가기: {spot}")
    print("트레이 아이콘 메뉴에서 보이기, 숨기기, 종료를 할 수 있습니다.")


if __name__ == "__main__":
    main()
