import uuid
from datetime import datetime, date
from typing import Any

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Double, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, Index,
    text, ARRAY,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, CITEXT
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(CITEXT, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    display_name = Column(Text, nullable=False)
    role = Column(String(20), nullable=False, default="operator")
    hae_import_token = Column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))

    goals = relationship("Goal", back_populates="user", uselist=False, cascade="all, delete-orphan")
    preferences = relationship("Preference", back_populates="user", cascade="all, delete-orphan")
    recipes = relationship("Recipe", back_populates="user", cascade="all, delete-orphan")
    meal_plans = relationship("MealPlan", back_populates="user", cascade="all, delete-orphan")
    coach_threads = relationship("CoachThread", back_populates="user", cascade="all, delete-orphan")


class Goal(Base):
    __tablename__ = "goals"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    target_weight_kg = Column(Numeric(5, 2))
    target_ldl_mg_dl = Column(Integer)
    current_ldl_mg_dl = Column(Integer)
    current_ldl_drawn_at = Column(Date)
    daily_calorie_target = Column(Integer)
    daily_sat_fat_g_max = Column(Numeric(5, 2))
    daily_soluble_fiber_g = Column(Numeric(5, 2))
    daily_protein_g_min = Column(Numeric(5, 2))
    dietary_pattern = Column(Text)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="goals")


class Preference(Base):
    __tablename__ = "preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "value"),
    )

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    kind = Column(Text, nullable=False, primary_key=True)
    value = Column(Text, nullable=False, primary_key=True)

    user = relationship("User", back_populates="preferences")


class Food(Base):
    __tablename__ = "foods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(Text, nullable=False)
    source_id = Column(Text)
    name = Column(Text, nullable=False)
    brand = Column(Text)
    serving_size_g = Column(Numeric(7, 2))
    nutrients_per_100g = Column(JSONB, nullable=False, default=dict)
    tags = Column(ARRAY(Text))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name = Column(Text, nullable=False)
    description = Column(Text)
    instructions = Column(ARRAY(Text))
    prep_minutes = Column(Integer)
    cook_minutes = Column(Integer)
    servings = Column(Numeric(4, 1), nullable=False, default=1)
    tags = Column(ARRAY(Text))
    source = Column(Text)
    nutrition_per_serving = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="recipes")
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeIngredient.sort_order")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    food_id = Column(UUID(as_uuid=True), ForeignKey("foods.id"))
    quantity = Column(Numeric(7, 2), nullable=False)
    unit = Column(Text, nullable=False)
    notes = Column(Text)
    sort_order = Column(Integer, nullable=False, primary_key=True)

    recipe = relationship("Recipe", back_populates="ingredients")
    food = relationship("Food")


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    week_start = Column(Date, nullable=False)
    status = Column(Text, nullable=False, default="active")
    generation_meta = Column(JSONB)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="meal_plans")
    slots = relationship("MealPlanSlot", back_populates="plan", cascade="all, delete-orphan")
    shopping_items = relationship("ShoppingListItem", back_populates="plan", cascade="all, delete-orphan")


class MealPlanSlot(Base):
    __tablename__ = "meal_plan_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"))
    slot_date = Column(Date, nullable=False)
    slot = Column(Text, nullable=False)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"))
    food_id = Column(UUID(as_uuid=True), ForeignKey("foods.id", ondelete="SET NULL"))
    custom_name = Column(Text)
    notes = Column(Text)
    nutrition = Column(JSONB)

    plan = relationship("MealPlan", back_populates="slots")
    recipe = relationship("Recipe")
    food = relationship("Food")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"
    __table_args__ = (
        UniqueConstraint("plan_id", "food_id", "unit"),
    )

    plan_id = Column(UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"), primary_key=True)
    food_id = Column(UUID(as_uuid=True), ForeignKey("foods.id"), primary_key=True)
    quantity = Column(Numeric(7, 2), nullable=False)
    unit = Column(Text, nullable=False, primary_key=True)
    aisle = Column(Text)
    purchased = Column(Boolean, nullable=False, default=False)

    plan = relationship("MealPlan", back_populates="shopping_items")
    food = relationship("Food")


class CoachThread(Base):
    __tablename__ = "coach_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    title = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="coach_threads")
    messages = relationship("CoachMessage", back_populates="thread", cascade="all, delete-orphan", order_by="CoachMessage.created_at")


class CoachMessage(Base):
    __tablename__ = "coach_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("coach_threads.id", ondelete="CASCADE"))
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    thread = relationship("CoachThread", back_populates="messages")


class MealEvent(Base):
    __tablename__ = "meal_events"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    ts = Column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slot = Column(Text, nullable=False)
    source = Column(Text, nullable=False)
    items = Column(JSONB, nullable=False, default=list)
    nutrition = Column(JSONB, nullable=False, default=dict)
    plan_slot_id = Column(UUID(as_uuid=True), ForeignKey("meal_plan_slots.id"))
    raw_input = Column(Text)
    confidence = Column(Numeric(3, 2))


class Biometric(Base):
    __tablename__ = "biometrics"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    ts = Column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    metric = Column(Text, primary_key=True)
    value = Column(Double, nullable=False)
    source = Column(Text, nullable=False)
    source_meta = Column(JSONB)
