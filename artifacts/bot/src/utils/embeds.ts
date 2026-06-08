import { EmbedBuilder, ColorResolvable } from "discord.js";

export const Colors = {
  Primary: 0x5865f2 as ColorResolvable,
  Success: 0x57f287 as ColorResolvable,
  Error: 0xed4245 as ColorResolvable,
  Warning: 0xfee75c as ColorResolvable,
  Info: 0x5865f2 as ColorResolvable,
  Economy: 0xf0c040 as ColorResolvable,
  Department: 0x3498db as ColorResolvable,
  BlackMarket: 0x2c2f33 as ColorResolvable,
};

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Error)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Primary)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export function economyEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Economy)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export function warningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}
