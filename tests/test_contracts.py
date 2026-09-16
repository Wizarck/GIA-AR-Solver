"""Contract and registry tests."""

import pytest

from gia_ar_solver.contracts import (
    ANSWER_STATES,
    QUESTION_STATES,
    BoundingBox,
    ModuleState,
    Option,
    SolverResult,
    TaskType,
)
from gia_ar_solver.registry import (
    get_solver,
    load_default_solvers,
    register,
    registered_families,
)
from gia_ar_solver.solvers.base import Solver
from gia_ar_solver.solvers.numeric import NumericSolver


def test_module_states_match_master_prompt():
    expected = {
        "UNKNOWN",
        "MODULE_INSTRUCTIONS",
        "READY",
        "QUESTION",
        "TRANSITION",
        "ANSWER_STATE",
        "COMPLETED",
    }
    assert {state.value for state in ModuleState} == expected
    assert QUESTION_STATES == {ModuleState.QUESTION, ModuleState.ANSWER_STATE}
    assert ANSWER_STATES == {ModuleState.ANSWER_STATE}


def test_task_types_cover_five_modules():
    assert len(TaskType) == 5


def test_solver_result_defaults():
    result = SolverResult(task_type=TaskType.NUMBER_SPEED, problem_family="N1")
    assert result.solved is False
    assert result.answer_id is None
    assert result.confidence == 0.0
    assert result.fallback_used is False


def test_bounding_box_as_list():
    assert BoundingBox(0.1, 0.2, 0.3, 0.4).as_list() == [0.1, 0.2, 0.3, 0.4]


def test_option_index_is_identity():
    option = Option(index=2, text="C", bbox=BoundingBox(0, 0, 1, 1))
    assert option.index == 2


def test_default_registry_loads_five_solvers():
    load_default_solvers()
    assert len(registered_families()) == 5
    assert get_solver(TaskType.NUMBER_SPEED).__class__ is NumericSolver


def test_double_registration_with_new_instance_raises():
    load_default_solvers()
    with pytest.raises(ValueError):
        register(NumericSolver())


def test_solver_contract_is_abstract():
    class Broken(Solver):
        task_type = TaskType.REASONING
        problem_family = "X"

    with pytest.raises(TypeError):
        Broken()  # must implement solve()
