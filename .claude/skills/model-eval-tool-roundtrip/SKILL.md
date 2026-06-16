---
name: model-eval-tool-roundtrip
description: >
  Verify that a model correctly handles tool-use (function-calling) round-trips
  after a model swap or provider change. Catches echo bugs, refusal loops, and
  malformed tool_call responses before they reach production agents. Run this
  after any add-model or update-model change, or whenever a model config is
  modified in agent profiles.
version: 1.0.0
audience: agent-only
agents: [axel, ellis, vera]
---

# Model Eval: Tool-Use Round-Trip Test

After any model swap, provider change, or config update, verify the model handles
tool-use round-trips correctly. A simple `say hi` chat completion does NOT catch
tool-use regressions — the echo bug (AGE-440) proved this.

## When to run

- After `add-model` or `update-model` on a LiteLLM proxy
- After changing a model in an agent's Hermes config (`config.yaml` → `model` / `provider`)
- After a provider key rotation that might change the underlying deployment
- After any incident involving agents echoing tool outputs or failing to call tools

## What this tests

1. **Tool-call generation** — model emits a valid `tool_calls` array when prompted
2. **Tool result processing** — model does NOT echo the tool result verbatim when
   given a tool-response message; it synthesizes a proper answer
3. **No refusal loops** — model doesn't refuse tool use or inject safety refusals
   into tool-call responses
4. **Structural correctness** — `function.name` matches expected tool names,
   `function.arguments` parses as valid JSON

## Prerequisites

```bash
LITELLM_BASE_URL  — e.g. https://my-proxy.example.com
LITELLM_API_KEY   — proxy admin key or agent key
MODEL_NAME        — the public model name to test (e.g. gpt-4o, claude-sonnet-4)
```

## Test 1: Tool-call generation

Send a message that requires the model to call a tool. Verify the response contains
a `tool_calls` array with valid structure.

```bash
curl -s -X POST "$LITELLM_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $LITELLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<MODEL_NAME>",
    "messages": [
      {"role": "system", "content": "You are a weather assistant. Use the get_weather function when asked about weather."},
      {"role": "user", "content": "What is the weather in Tokyo?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {"type": "string", "description": "City name"}
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "max_tokens": 200
  }' | python3 -c '
import sys, json
resp = json.load(sys.stdin)
choice = resp["choices"][0]
msg = choice["message"]

# Check for tool_calls
tool_calls = msg.get("tool_calls", [])
if not tool_calls:
    print("FAIL: No tool_calls in response. Model did not generate a tool call.")
    print("Finish reason:", choice.get("finish_reason"))
    print("Content:", msg.get("content", "")[:200])
    sys.exit(1)

tc = tool_calls[0]
fn = tc.get("function", {})
print(f"PASS: Tool call generated")
print(f"  Function: {fn.get(\"name\", \"(missing)\")}")
print(f"  Arguments: {fn.get(\"arguments\", \"(missing)\")[:200]}")

# Validate structure
if fn.get("name") != "get_weather":
    print(f"WARN: Expected function name get_weather, got {fn.get(\"name\")}")
try:
    args = json.loads(fn.get("arguments", "{}"))
    if "location" not in args:
        print(f"WARN: Expected location argument, got keys: {list(args.keys())}")
except json.JSONDecodeError:
    print("FAIL: Arguments are not valid JSON")
    sys.exit(1)
'
```

**PASS criteria**: Response contains `tool_calls` array, function name is `get_weather`,
arguments parse as valid JSON and include `location`.

## Test 2: Tool result processing (echo detection)

Send a tool result back to the model. Verify the model processes it — it should
synthesize a natural-language answer, NOT echo the tool result verbatim.

```bash
curl -s -X POST "$LITELLM_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $LITELLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<MODEL_NAME>",
    "messages": [
      {"role": "system", "content": "You are a weather assistant. Use the get_weather function when asked about weather."},
      {"role": "user", "content": "What is the weather in Tokyo?"},
      {"role": "assistant", "content": null, "tool_calls": [
        {
          "id": "call_test_001",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\\\"location\\\": \\\"Tokyo\\\"}"
          }
        }
      ]},
      {"role": "tool", "tool_call_id": "call_test_001", "content": "WEATHER_DATA: Tokyo, 22C, partly cloudy, humidity 65%, wind 12km/h NE. Forecast: clearing skies this afternoon."},
      {"role": "user", "content": "So what should I wear today?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {"type": "string", "description": "City name"}
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "max_tokens": 300
  }' | python3 -c '
import sys, json
resp = json.load(sys.stdin)
msg = resp["choices"][0]["message"]
content = msg.get("content", "")

# Echo detection: check if the model regurgitated the exact tool output
tool_output = "WEATHER_DATA: Tokyo, 22C, partly cloudy, humidity 65%, wind 12km/h NE. Forecast: clearing skies this afternoon."
if tool_output in content:
    print("FAIL: Model echoed tool output verbatim (echo bug)")
    print(f"  Content: {content[:400]}")
    sys.exit(1)

# Check for partial echo (more than 30 chars of exact tool output)
overlap = 0
for i in range(len(tool_output) - 30):
    if tool_output[i:i+30] in content:
        overlap += 1
if overlap > 3:
    print("WARN: Model contains extended verbatim copy of tool output")
    print(f"  Content: {content[:400]}")

# Check for meaningful response
if len(content) < 10:
    print("WARN: Response very short, model may not have processed tool result")
    print(f"  Content: {content}")
elif len(content) > 10:
    print("PASS: Model processed tool result and generated a natural response")
    print(f"  Content preview: {content[:200]}")
'
```

**PASS criteria**: Model generates a natural-language response (e.g. "Light clothing
today...") that incorporates the weather data. It must NOT echo `WEATHER_DATA: ...`
verbatim. Responses under 10 chars or exact copies of the tool output are failures.

## Test 3: Multi-tool coherence

Send a prompt requiring the model to call two tools and synthesize both results.

```bash
curl -s -X POST "$LITELLM_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $LITELLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<MODEL_NAME>",
    "messages": [
      {"role": "system", "content": "You are a travel assistant. Use available tools to answer questions."},
      {"role": "user", "content": "I need to fly from New York to London. What is the weather in both cities?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "get_flight",
          "description": "Get flight information between two cities",
          "parameters": {
            "type": "object",
            "properties": {
              "from": {"type": "string"},
              "to": {"type": "string"}
            },
            "required": ["from", "to"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "max_tokens": 300
  }' | python3 -c '
import sys, json
resp = json.load(sys.stdin)
tool_calls = resp["choices"][0]["message"].get("tool_calls", [])
names = [tc["function"]["name"] for tc in tool_calls]

if len(tool_calls) < 1:
    print("FAIL: Model did not call any tools for a multi-tool prompt")
    sys.exit(1)

print(f"Tool calls: {len(tool_calls)}")
for n in names:
    print(f"  - {n}")

# Ideal: model calls both get_weather twice (NYC + London) AND get_flight
# Minimum pass: at least one relevant tool call
weather_called = "get_weather" in names
flight_called = "get_flight" in names

if weather_called and flight_called:
    print("PASS: Model called both weather and flight tools")
elif weather_called or flight_called:
    print("PARTIAL: Model called relevant tools but missed one category")
else:
    print("FAIL: Model did not call expected tools")
    sys.exit(1)
'
```

**PASS criteria**: Model calls at least one weather tool and the flight tool. Full
pass = both weather calls (NYC + London) + flight call.

## Checklist summary

After running all three tests, record:

| Test | Pass? | Notes |
|------|-------|-------|
| Tool-call generation | | |
| Tool result processing (no echo) | | |
| Multi-tool coherence | | |

If any test fails, **do not deploy the model to production agents**. Document the
failure mode (echo, refusal, malformed JSON, missing tool calls) and report it
as a blocker before the swap proceeds.

## Integration with add-model / update-model

Add this test block to the **Test it** section of both skills:

> After the basic `say hi` test, run the tool-use round-trip test
> (`model-eval-tool-roundtrip` skill) to verify the model handles function
> calling correctly. This catches echo bugs and refusal loops that simple text
> completions miss.

## Common failure modes

| Failure | Symptom | Fix |
|---------|---------|-----|
| No tool_calls | Model responds with text instead of calling tool | Try `tool_choice: "required"` or check model supports function calling |
| Echo bug | Model returns tool output verbatim | Model may be misconfigured or provider doesn't handle tool role correctly |
| Refusal loop | Model refuses to use tools or injects safety messages | Check provider moderation settings |
| Malformed arguments | `function.arguments` is not valid JSON | Some open-source models produce invalid args; may need a different model or args schema |
| Wrong function name | Model calls a tool that doesn't match the schema | Prompt engineering or model limitation; consider a more capable model |