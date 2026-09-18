"""오버레이를 혼자 도는 프로그램으로 만들어 깐다.

    python overlay\\build.py

하는 일은 셋이다.
  1. PyInstaller 로 dist/주사위/ 를 만든다 (overlay/dice.spec).
  2. 그 폴더를 %LOCALAPPDATA%\\Programs\\주사위\\ 로 옮긴다.
  3. 바탕화면과 시작 메뉴 바로가기를 그쪽으로 맞춘다.

2번이 있는 이유: dist/ 는 빌드 찌꺼기 자리다. --clean 으로 다시 만들 때
통째로 지워지므로, 매일 쓰는 프로그램이 거기 살면 안 된다. 윈도우에서
사용자 몫으로 까는 프로그램이 가는 자리가 %LOCALAPPDATA%\\Programs 다.

깔고 나면 이 저장소도 가상환경도 없어도 돌아간다. 화면(WebView2)만
윈도우에 이미 들어 있는 걸 쓴다.
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
    print("묶는 중…")
    # PyInstaller 는 진행 상황을 stderr 로 쏟아 낸다. 잘 끝나면 볼 일이 없다.
    done = subprocess.run([*cmd, str(SPEC), "--noconfirm", "--clean"], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8",
                          errors="replace")
    if done.returncode != 0:
        print(done.stderr[-4000:])
        raise SystemExit("묶다가 실패했습니다.")
    if not (BUILT / f"{NAME}.exe").exists():
        raise SystemExit(f"만들어지지 않았습니다: {BUILT}")


def install() -> Path:
    """깔린 자리를 비우고 새로 옮긴다.

    돌고 있으면 exe 를 덮어쓸 수 없다. 그때는 먼저 트레이에서 종료해야
    한다고 일러 준다 ─ 조용히 실패해서 옛날 것이 남아 있는 게 제일 나쁘다.
    """
    HOME.parent.mkdir(parents=True, exist_ok=True)
    if HOME.exists():
        try:
            shutil.rmtree(HOME)
        except PermissionError:
            raise SystemExit(
                f"쓰고 있는 중이라 못 지웁니다: {HOME}\n"
                f"  트레이의 주사위 아이콘에서 '종료' 를 누르고 다시 해 주세요."
            )
    shutil.copytree(BUILT, HOME)
    return HOME / f"{NAME}.exe"


def shortcuts(target: Path) -> list[str]:
    """바탕화면과 시작 메뉴에 바로가기를 놓는다(있으면 고쳐 놓는다)."""
    # 파워셸이 한글 경로를 돌려준다. 콘솔 코드페이지에 맡기면 깨지므로 못박는다.
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
        print("바로가기를 놓지 못했습니다:", out.stderr.strip())
        return []
    return [line for line in out.stdout.splitlines() if line.strip()]


def main() -> None:
    # 한글 경로를 찍다가 콘솔 코드페이지에 걸려 넘어지지 않게.
    sys.stdout.reconfigure(errors="replace")
    build()
    target = install()
    size = sum(f.stat().st_size for f in HOME.rglob("*") if f.is_file())
    print(f"깔았습니다: {target}  ({size / 1024 / 1024:.0f}MB)")
    for spot in shortcuts(target):
        print(f"  바로가기 {spot}")
    print("트레이 아이콘에서 보이기·숨기기·종료를 합니다.")


if __name__ == "__main__":
    main()
