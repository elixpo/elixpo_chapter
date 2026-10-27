import asyncio

from ipcService.searchPortManager import SearchAgentPool


def test_text_agents_are_selected_round_robin_under_equal_lifetime_counts():
    async def run():
        pool = SearchAgentPool(pool_size=2, max_tabs_per_agent=20)
        first = object()
        second = object()
        pool.text_agents = [first, second]
        pool.text_agent_tabs = [0, 0]

        selected = [await pool.get_text_agent() for _ in range(4)]
        return selected

    selected = asyncio.run(run())
    assert [index for _agent, index in selected] == [0, 1, 0, 1]
