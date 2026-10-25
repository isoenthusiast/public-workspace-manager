"""Run from a source checkout without installing dependencies."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from workspace_manager.server import main
if __name__ == "__main__":
    main()
