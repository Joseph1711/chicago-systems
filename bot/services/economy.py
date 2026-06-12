from bot.db import execute
from bot.helpers import generate_id
import datetime

TRANSACTION_TYPES = [
    "daily","weekly","work","pay","transfer","deposit","withdraw",
    "loan_taken","loan_repaid","investment","investment_return",
    "savings_interest","marketplace_sale","marketplace_purchase",
    "auction_win","auction_sale","shop_purchase","blackmarket_purchase",
    "property_purchase","property_sale","property_rent",
    "company_deposit","company_salary","department_salary",
    "admin_give","donation","money_laundering","drug_sale",
    "contract_reward","treasury_grant","repair_cost"
]

def add_cash(user_id, guild_id, amount):
    execute(
        "UPDATE users SET cash=cash+$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
        (amount, user_id, guild_id)
    )

def remove_cash(user_id, guild_id, amount):
    row = execute(
        "SELECT cash FROM users WHERE discord_id=$1 AND guild_id=$2",
        (user_id, guild_id), fetch="one"
    )
    if not row or row["cash"] < amount:
        return False
    execute(
        "UPDATE users SET cash=cash-$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
        (amount, user_id, guild_id)
    )
    return True

def add_bank(user_id, guild_id, amount):
    execute(
        "UPDATE users SET bank=bank+$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
        (amount, user_id, guild_id)
    )

def remove_bank(user_id, guild_id, amount):
    row = execute(
        "SELECT bank FROM users WHERE discord_id=$1 AND guild_id=$2",
        (user_id, guild_id), fetch="one"
    )
    if not row or row["bank"] < amount:
        return False
    execute(
        "UPDATE users SET bank=bank-$1, updated_at=NOW() WHERE discord_id=$2 AND guild_id=$3",
        (amount, user_id, guild_id)
    )
    return True

def get_balance(user_id, guild_id):
    return execute(
        "SELECT cash, bank FROM users WHERE discord_id=$1 AND guild_id=$2",
        (user_id, guild_id), fetch="one"
    )

def transfer(from_id, to_id, guild_id, amount, tx_type="transfer", description=""):
    ok = remove_cash(from_id, guild_id, amount)
    if not ok:
        return False
    add_cash(to_id, guild_id, amount)
    log_transaction(from_id, guild_id, tx_type, -amount, description)
    log_transaction(to_id, guild_id, tx_type, amount, description)
    return True

def log_transaction(user_id, guild_id, tx_type, amount, description=""):
    execute(
        """INSERT INTO transactions (id, discord_id, guild_id, type, amount, description, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())""",
        (generate_id(), user_id, guild_id, tx_type, amount, description)
    )
