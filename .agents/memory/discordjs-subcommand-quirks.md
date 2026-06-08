---
name: Discord.js v14 subcommand quirks
description: setDefaultMemberPermissions only works on top-level builder, not on subcommand builders.
---

**Rule:** `setDefaultMemberPermissions(PermissionFlagsBits.X)` can only be called on the top-level `SlashCommandBuilder`, not inside `.addSubcommand(s => s.setDefaultMemberPermissions(...))`.

**Why:** Discord.js v14 types only expose this method on `SlashCommandBuilder`, not `SlashCommandSubcommandBuilder`. Calling it on a subcommand causes TS2339.

**How to apply:** Put permission gates at the top-level builder level, OR check permissions inside the `execute()` function using `interaction.memberPermissions?.has(...)`.

Also: `message.channel.send()` requires checking `isTextBased() && "send" in channel` because `message.channel` can be a partial DM channel type that lacks `.send()`.
