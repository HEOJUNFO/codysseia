"""설치 확인용 최소 시뮬레이션: 두 사람과 대화 GM, 몇 스텝.

  ./tools/concordia/run.sh smoke.py [스텝 수]

로그 HTML 은 tools/concordia/out/ 에 남는다 (커밋하지 않는다).
"""

from pathlib import Path
import sys

from concordia.prefabs import entity as entity_prefabs
from concordia.prefabs import game_master as game_master_prefabs
from concordia.prefabs.simulation import generic as simulation
from concordia.typing import prefab as prefab_lib
from concordia.utils import helper_functions

from codex_model import CodexLanguageModel
import embedder

max_steps = int(sys.argv[1]) if len(sys.argv) > 1 else 2

prefabs = {
    **helper_functions.get_package_classes(entity_prefabs),
    **helper_functions.get_package_classes(game_master_prefabs),
}
instances = [
    prefab_lib.InstanceConfig(
        prefab="basic__Entity",
        role=prefab_lib.Role.ENTITY,
        params={"name": "Mira", "goal": "Find out what is buried on the island"},
    ),
    prefab_lib.InstanceConfig(
        prefab="basic__Entity",
        role=prefab_lib.Role.ENTITY,
        params={"name": "Oren", "goal": "Leave the island before nightfall"},
    ),
    prefab_lib.InstanceConfig(
        prefab="dialogic__GameMaster",
        role=prefab_lib.Role.GAME_MASTER,
        params={
            "name": "conversation rules",
            "next_game_master_name": "conversation rules",
        },
    ),
]
config = prefab_lib.Config(
    default_premise=(
        "Mira and Oren wash ashore on a small island and meet by the wreck."
    ),
    default_max_steps=max_steps,
    prefabs=prefabs,
    instances=instances,
)

sim = simulation.Simulation(
    config=config, model=CodexLanguageModel(), embedder=embedder.embed
)
log = sim.play()

out = Path(__file__).parent / "out"
out.mkdir(exist_ok=True)
(out / "smoke.html").write_text(log.to_html())
print(f"로그: {out / 'smoke.html'}")
