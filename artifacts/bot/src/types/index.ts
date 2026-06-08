import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  PermissionResolvable,
} from "discord.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  cooldown?: number;
  permissions?: PermissionResolvable[];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface ButtonHandler {
  customId: string;
  execute(interaction: ButtonInteraction): Promise<void>;
}

export interface SelectMenuHandler {
  customId: string;
  execute(interaction: StringSelectMenuInteraction): Promise<void>;
}

export interface ModalHandler {
  customId: string;
  execute(interaction: ModalSubmitInteraction): Promise<void>;
}

export type InteractionHandler = ButtonHandler | SelectMenuHandler | ModalHandler;
