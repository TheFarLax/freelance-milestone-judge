"""Start glsim with an OpenAI-compatible gateway as the LLM backend.

glsim's built-in OpenAI handler always posts to https://api.openai.com and
ignores OPENAI_BASE_URL. That breaks against any OpenAI-compatible gateway,
so this launcher reuses glsim's handler but redirects the HTTP call to the
configured base URL. Installed packages are left untouched.

Usage:
    python scripts/run_glsim.py --port 4000 --validators 3 --provider openai:gemini-2.5-flash
"""

import argparse
import os

import httpx

import glsim.live_io as live_io


def _patch_openai_base_url() -> None:
    """Make glsim's OpenAI caller honour OPENAI_BASE_URL."""
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    endpoint = base + "/chat/completions"
    original = live_io.create_llm_handler

    def patched(provider_config=None):
        handler = original(provider_config)

        def redirecting_handler(data):
            # Re-implement the OpenAI call so only the URL changes. Keeping the
            # rest of glsim's logic intact means errors surface the same way.
            config = provider_config or "openai:gpt-4o-mini"
            provider, _, model = config.partition(":")
            if provider != "openai":
                return handler(data)

            prompt = data.get("prompt", "")
            response_format = (data.get("config") or {}).get("response_format")
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return {"ok": "live_io LLM error: OPENAI_API_KEY not set"}

            payload = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
            }
            if response_format == "json":
                payload["response_format"] = {"type": "json_object"}

            try:
                resp = httpx.Client(timeout=120).post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"]
            except Exception as exc:
                if os.environ.get("GLSIM_LOG_LLM"):
                    print(f"[LLM] ERROR {exc}", flush=True)
                return {"ok": f"live_io LLM error: {exc}"}

            if os.environ.get("GLSIM_LOG_LLM"):
                kind = type(text).__name__
                preview = str(text)[:80].replace("\n", " ")
                print(f"[LLM] {kind} {preview}", flush=True)

            if response_format == "json":
                try:
                    import json

                    # Some gateways wrap JSON in markdown fences.
                    cleaned = text.strip()
                    if cleaned.startswith("```"):
                        cleaned = cleaned.split("\n", 1)[-1]
                        cleaned = cleaned.rsplit("```", 1)[0].strip()
                    return {"ok": json.loads(cleaned)}
                except Exception:
                    pass
            return {"ok": text}

        return redirecting_handler

    live_io.create_llm_handler = patched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--validators", type=int, default=3)
    parser.add_argument("--max-rotations", type=int, default=3)
    parser.add_argument("--provider", default=None, help="provider:model, e.g. openai:gemini-2.5-flash")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    _patch_openai_base_url()

    from glsim.server import create_app, run_server

    app = create_app(
        num_validators=args.validators,
        max_rotations=args.max_rotations,
        llm_provider=args.provider,
        use_browser=not args.no_browser,
        verbose=args.verbose,
    )
    run_server(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
