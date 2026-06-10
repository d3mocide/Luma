import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    Double,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="operator")
    hae_import_token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_password_temp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default='0')
    nudge_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    nudge_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=19, server_default='19')
    nudge_tz: Mapped[str] = mapped_column(Text, nullable=False, default='UTC', server_default="'UTC'")
    birth_year: Mapped[int | None] = mapped_column(Integer)
    biological_sex: Mapped[str | None] = mapped_column(Text)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    activity_level: Mapped[str | None] = mapped_column(Text)

    goals = relationship("Goal", back_populates="user", uselist=False, cascade="all, delete-orphan")
    preferences = relationship("Preference", back_populates="user", cascade="all, delete-orphan")
    recipes = relationship("Recipe", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    meal_plans = relationship("MealPlan", back_populates="user", cascade="all, delete-orphan")
    coach_threads = relationship("CoachThread", back_populates="user", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")


class Goal(Base):
    __tablename__ = "goals"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    target_ldl_mg_dl: Mapped[int | None] = mapped_column(Integer)
    current_ldl_mg_dl: Mapped[int | None] = mapped_column(Integer)
    current_ldl_drawn_at: Mapped[date | None] = mapped_column(Date)
    daily_calorie_target: Mapped[int | None] = mapped_column(Integer)
    daily_sat_fat_g_max: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    daily_soluble_fiber_g: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    daily_protein_g_min: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    daily_sugar_g_max: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    dietary_pattern: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="goals")


class Preference(Base):
    __tablename__ = "preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "value"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, primary_key=True)

    user = relationship("User", back_populates="preferences")


class Food(Base):
    __tablename__ = "foods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)
    serving_size_g: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    nutrients_per_100g: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    household_measures: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    detail_enriched: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    category: Mapped[str | None] = mapped_column(Text, index=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    flags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default='{}', index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    prep_minutes: Mapped[int | None] = mapped_column(Integer)
    cook_minutes: Mapped[int | None] = mapped_column(Integer)
    servings: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False, default=1)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    source: Mapped[str | None] = mapped_column(Text)
    nutrition_per_serving: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="recipes")
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeIngredient.sort_order")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    food_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("foods.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)

    recipe = relationship("Recipe", back_populates="ingredients")
    food = relationship("Food")


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    generation_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="meal_plans")
    slots = relationship("MealPlanSlot", back_populates="plan", cascade="all, delete-orphan")
    shopping_items = relationship("ShoppingListItem", back_populates="plan", cascade="all, delete-orphan")


class MealPlanSlot(Base):
    __tablename__ = "meal_plan_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"))
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    slot: Mapped[str] = mapped_column(Text, nullable=False)
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id"))
    food_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("foods.id", ondelete="SET NULL"))
    custom_name: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    nutrition: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')

    plan = relationship("MealPlan", back_populates="slots")
    recipe = relationship("Recipe")
    food = relationship("Food")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"
    __table_args__ = (
        UniqueConstraint("plan_id", "food_id", "unit"),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("meal_plans.id", ondelete="CASCADE"), primary_key=True)
    food_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("foods.id"), primary_key=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False, primary_key=True)
    aisle: Mapped[str | None] = mapped_column(Text)
    purchased: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    plan = relationship("MealPlan", back_populates="shopping_items")
    food = relationship("Food")


class CoachThread(Base):
    __tablename__ = "coach_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="coach_threads")
    messages = relationship("CoachMessage", back_populates="thread", cascade="all, delete-orphan", order_by="CoachMessage.created_at")


class CoachMessage(Base):
    __tablename__ = "coach_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("coach_threads.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls: Mapped[Any | None] = mapped_column(JSONB)
    is_summary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    thread = relationship("CoachThread", back_populates="messages")


class CoachContext(Base):
    __tablename__ = "coach_context"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    context: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class Alert(Base):
    __tablename__ = "alerts"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    narrative: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'open'"))

    user = relationship("User")


class MealEvent(Base):
    __tablename__ = "meal_events"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slot: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    items: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    nutrition: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    plan_slot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("meal_plan_slots.id"))
    favorite_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("favorites.id", ondelete="SET NULL"))
    raw_input: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))


class MealJournalEntry(Base):
    __tablename__ = "meal_journal_entries"
    __table_args__ = (
        Index("ix_journal_user_created", "user_id", "created_at"),
        Index("ix_journal_meal_event", "meal_event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    meal_name: Mapped[str] = mapped_column(Text, nullable=False)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    energy: Mapped[int] = mapped_column(Integer, nullable=False)
    digestion: Mapped[int] = mapped_column(Integer, nullable=False)
    mood: Mapped[int] = mapped_column(Integer, nullable=False)
    satiety: Mapped[int] = mapped_column(Integer, nullable=False)
    symptoms: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default='{}')
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")


class Biometric(Base):
    __tablename__ = "biometrics"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    metric: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[float] = mapped_column(Double, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        Index("ix_favorites_user_id", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="favorites")
    items = relationship("FavoriteItem", back_populates="favorite", cascade="all, delete-orphan", order_by="FavoriteItem.sort_order")


class FavoriteItem(Base):
    __tablename__ = "favorite_items"
    __table_args__ = (
        Index("ix_favorite_items_fav", "favorite_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    favorite_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("favorites.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    food_name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)
    quantity_g: Mapped[float] = mapped_column(Float, nullable=False)
    nutrients: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    favorite = relationship("Favorite", back_populates="items")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    device_label: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="push_subscriptions")


class FamilyGroup(Base):
    __tablename__ = "family_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    members = relationship("FamilyMember", back_populates="group", cascade="all, delete-orphan")
    shares = relationship("GroupShare", back_populates="group", cascade="all, delete-orphan")


class FamilyMember(Base):
    __tablename__ = "family_members"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("family_groups.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="member", server_default="'member'")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    group = relationship("FamilyGroup", back_populates="members")
    user = relationship("User")


class FamilyInvitation(Base):
    __tablename__ = "family_invitations"
    __table_args__ = (
        Index("ix_family_invitations_token", "token", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False)
    invited_email: Mapped[str] = mapped_column(CITEXT, nullable=False)
    invited_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    group = relationship("FamilyGroup")


class GroupShare(Base):
    __tablename__ = "group_shares"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(Text, nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    shared_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    shared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    group = relationship("FamilyGroup", back_populates="shares")
