import discord

COLOR_SUCCESS = 0x57F287
COLOR_ERROR = 0xED4245
COLOR_WARNING = 0xFEE75C
COLOR_INFO = 0x5865F2
COLOR_ECONOMY = 0xF1C40F
COLOR_DEPARTMENT = 0x3498DB
COLOR_BLACKMARKET = 0x2C2F33
COLOR_CRIMINAL = 0x8B0000
COLOR_DIRTY = 0x7B6100
COLOR_PRIMARY = 0x5865F2

def success_embed(title, description=None):
    e = discord.Embed(title=f"✅ {title}", description=description, color=COLOR_SUCCESS)
    e.timestamp = discord.utils.utcnow()
    return e

def error_embed(title, description=None):
    e = discord.Embed(title=f"❌ {title}", description=description, color=COLOR_ERROR)
    e.timestamp = discord.utils.utcnow()
    return e

def warning_embed(title, description=None):
    e = discord.Embed(title=f"⚠️ {title}", description=description, color=COLOR_WARNING)
    e.timestamp = discord.utils.utcnow()
    return e

def info_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_INFO)
    e.timestamp = discord.utils.utcnow()
    return e

def economy_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_ECONOMY)
    e.timestamp = discord.utils.utcnow()
    return e

def department_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_DEPARTMENT)
    e.timestamp = discord.utils.utcnow()
    return e

def blackmarket_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_BLACKMARKET)
    e.timestamp = discord.utils.utcnow()
    return e

def criminal_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_CRIMINAL)
    e.timestamp = discord.utils.utcnow()
    return e

def dirty_embed(title, description=None):
    e = discord.Embed(title=title, description=description, color=COLOR_DIRTY)
    e.timestamp = discord.utils.utcnow()
    return e
