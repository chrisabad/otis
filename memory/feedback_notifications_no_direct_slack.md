---
name: feedback_notifications_no_direct_slack
description: "All fleet alerts must go through the notification service at 127.0.0.1:8012, never directly to Slack"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 94116461-d6cd-4721-a8fa-7834239147b1
---

All alerts and notifications must route through the local notification service (`http://127.0.0.1:8012/notifications`), never directly to the Slack API.

**Why:** The notification service is the single routing layer for all fleet alerts. Bypassing it creates inconsistent delivery, loses audit trail, and breaks the ability to reroute or filter notifications centrally.

**How to apply:** In any monitor script or tool that needs to alert: call the notification service, not `slack` tool calls or direct `chat.postMessage` API calls. Use the same pattern as `dispatch-failure-monitor.py`:
```python
subprocess.run(['curl', '-s', '-X', 'POST', 'http://127.0.0.1:8012/notifications',
    '-H', 'Content-Type: application/json',
    '-H', f'Authorization: Bearer {api_key}',
    '-d', json.dumps(payload)], ...)
```
The service handles routing to Slack and any other channels internally.
