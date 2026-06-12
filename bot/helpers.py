import uuid
import math
from bot.db import execute

def generate_id():
    return str(uuid.uuid4())

def format_currency(amount, symbol="$"):
    return f"{symbol}{amount:,.0f}"

def format_time(seconds):
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        m = seconds // 60
        s = seconds % 60
        return f"{m}m {s}s" if s else f"{m}m"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m" if m else f"{h}h"
    d = seconds // 86400
    h = (seconds % 86400) // 3600
    return f"{d}d {h}h" if h else f"{d}d"

def format_time_ms(ms):
    return format_time(ms / 1000)

def xp_for_level(level):
    return math.floor(100 * (1.5 ** (level - 1)))

def calculate_level(xp):
    level = 1
    while xp >= xp_for_level(level + 1):
        level += 1
    return level

def clamp(value, min_val, max_val):
    return max(min_val, min(max_val, value))

def random_between(a, b):
    import random
    return random.randint(a, b)

def chunk_array(arr, size):
    return [arr[i:i+size] for i in range(0, len(arr), size)]

def get_or_create_user(discord_id, guild_id):
    row = execute(
        "SELECT * FROM users WHERE discord_id=$1 AND guild_id=$2",
        (discord_id, guild_id), fetch="one"
    )
    if row:
        return dict(row)
    execute(
        """INSERT INTO users (id, discord_id, guild_id, cash, bank, xp, level, reputation, dirty_money,
           is_verified, created_at, updated_at)
           VALUES ($1,$2,$3,500,0,0,1,0,0,false,NOW(),NOW())
           ON CONFLICT DO NOTHING""",
        (generate_id(), discord_id, guild_id)
    )
    return dict(execute(
        "SELECT * FROM users WHERE discord_id=$1 AND guild_id=$2",
        (discord_id, guild_id), fetch="one"
    ))

def get_or_create_guild_config(guild_id):
    row = execute("SELECT * FROM guild_config WHERE guild_id=$1", (guild_id,), fetch="one")
    if row:
        return dict(row)
    execute(
        """INSERT INTO guild_config (id, guild_id, daily_amount, weekly_amount, tax_rate,
           created_at, updated_at)
           VALUES ($1,$2,500,2500,5,NOW(),NOW()) ON CONFLICT DO NOTHING""",
        (generate_id(), guild_id)
    )
    return dict(execute("SELECT * FROM guild_config WHERE guild_id=$1", (guild_id,), fetch="one"))
