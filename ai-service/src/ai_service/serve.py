"""Start the AI service.

    uv run ai-serve                         # 127.0.0.1:8000
    uv run ai-serve --host 0.0.0.0 --port 8000

Always runs on a selector-based asyncio event loop. psycopg's async mode (used
for the vector database) can't run on the ProactorEventLoop that uvicorn picks
on Windows by default. On Linux the selector loop is the standard one anyway,
so production behaves the same either way.
"""

import argparse
import asyncio

import uvicorn


def selector_event_loop() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ai-serve", description="Start the NewnopDesk AI service")
    # Loopback by default: the service is internal and must not be exposed publicly
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)

    uvicorn.run(
        "ai_service.main:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        loop="ai_service.serve:selector_event_loop",
    )


if __name__ == "__main__":
    main()
