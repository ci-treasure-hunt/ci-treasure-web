---
slug: agents
title: Use CI Treasure Hunt from your AI assistant
description: Connect Claude, ChatGPT, Grok, Gemini or any MCP-capable AI agent to CI Treasure Hunt and ask it about contact improvisation events, teachers, venues and communities.
keywords: contact improvisation mcp server, ci treasure hunt ai assistant, contact improvisation events chatgpt, claude connector contact improvisation
ogImage: /opengraph-image.jpg
---

# Use CI Treasure Hunt from your AI assistant

CI Treasure Hunt has an MCP server: a connection that lets an AI assistant search this directory
directly instead of guessing from the web. Once it is connected, you can ask things like
"Which contact improvisation festivals are there in Portugal next spring?", "Who teaches at the
Breitenbush jam?" or "Where can I dance CI in Lisbon?" and get answers from the live listings,
with links back to the pages here.

The connection is read-only and needs no account. It sees what this website shows publicly and
nothing else: no email addresses, no phone numbers, no group invite links. Those stay on the
event and community pages.

## The address

```
https://citreasurehunt.com/api/mcp
```

## How to connect it

- **Claude:** CI Treasure Hunt is in Claude's connector directory. Open
  [its directory page](https://claude.ai/directory/ci-treasure-hunt) and choose Connect, or find
  it under Settings, then Connectors, then Browse.
- **Grok:** go to grok.com/connectors, choose New Connector, then Custom, and paste the address.
- **Gemini:** in Gemini Spark, open Connected Apps and add the address as an MCP server.
- **ChatGPT:** with developer mode switched on, add the address as a connector under Settings.
- **Other agents:** any client that supports MCP over Streamable HTTP can use the address
  directly.

The menus move around as these apps change. If the steps above no longer match, look for
"connectors", "MCP" or "custom tools" in your assistant's settings.

## If your assistant answers from the web instead

Some assistants still reach for a web search first, even with the connection installed. Web
results for contact improvisation events are often a year old or mix in past editions. If the
answer looks like that, name the source in your question, for example "Use CI Treasure Hunt: which
CI festivals are there in Germany next summer?", and the assistant will query the directory
directly.

## What it can do

- Search upcoming events by country, city, dates, type and practice
- Show an event's details: dates, place, prices, teachers, organizers, level and languages
- Find teachers, organizers and musicians, and show their profiles and upcoming events
- Find venues and local communities, the groups that run regular jams and classes

Contact improvisation is the default. Events in related practices are included when you ask
for them.

## What it cannot do

It does not book places or send messages, and it cannot add or change listings. To list an
event, use [the submission form](/events/new). To fix something, write to
hello@citreasurehunt.com.
