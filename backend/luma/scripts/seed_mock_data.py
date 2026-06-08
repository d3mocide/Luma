"""Seed script to populate high-fidelity mock biometric and dietary data for a user.

Enables instant rendering of today metrics, 30-day trends, and coach chat queries.
"""
import argparse
import asyncio
import datetime
import random
import sys
from uuid import UUID

from argon2 import PasswordHasher
from sqlalchemy import delete, select, text

from luma.db.models import Biometric, Goal, MealEvent, User
from luma.db.session import AsyncSessionLocal


def normalize_uuid(u: str) -> str:
    u = u.strip()
    # Handle the case where user copied a 35-character UUID missing a digit in the first block
    if len(u) == 35:
        parts = u.split("-")
        if len(parts) == 5:
            if len(parts[0]) == 7:
                parts[0] = "0" + parts[0]
            elif len(parts[4]) == 11:
                parts[4] = "0" + parts[4]
            u = "-".join(parts)
    return u


async def seed_data(user_id_str: str) -> None:
    normalized = normalize_uuid(user_id_str)
    try:
        user_uuid = UUID(normalized)
    except ValueError:
        print(f"ERROR: '{user_id_str}' is not a valid UUID format (even after normalization try: '{normalized}')")
        sys.exit(1)

    print(f"Seeding mock data for User ID: {user_uuid}")

    ph = PasswordHasher()

    async with AsyncSessionLocal() as db:
        # 1. Ensure user exists
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()

        if not user:
            print(f"User {user_uuid} not found. Creating user account...")
            user = User(
                id=user_uuid,
                email="mock-operator@luma.health",
                password_hash=ph.hash("changeme"),
                display_name="Mock Operator",
                role="operator",
            )
            db.add(user)
            await db.commit()
            print("Created new operator user with email: mock-operator@luma.health")
        else:
            print(f"Found existing user: {user.email} (display name: {user.display_name})")

        # 2. Reset existing mock data for idempotency
        print("Clearing out any existing biometrics and meal events for this user to ensure fresh seed...")
        await db.execute(delete(Biometric).where(Biometric.user_id == user_uuid))
        await db.execute(delete(MealEvent).where(MealEvent.user_id == user_uuid))
        await db.execute(delete(Goal).where(Goal.user_id == user_uuid))
        await db.commit()

        # 3. Add Goals
        print("Seeding goals (target weight, cholesterol limits, caloric and fiber budgets)...")
        goal = Goal(
            user_id=user_uuid,
            target_weight_kg=75.0,
            target_ldl_mg_dl=100,
            current_ldl_mg_dl=145,
            current_ldl_drawn_at=datetime.date.today() - datetime.timedelta(days=30),
            daily_calorie_target=2000,
            daily_sat_fat_g_max=10.0,
            daily_soluble_fiber_g=15.0,
            daily_protein_g_min=80.0,
            dietary_pattern="cholesterol-lowering",
        )
        db.add(goal)

        # 4. Add Biometrics (30 days timeseries)
        print("Generating 30 days of biometric timeseries data (weight, ldl, sleep, active energy)...")
        start_date = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=30)
        
        biometrics_to_add = []
        for i in range(31):
            day_ts = start_date + datetime.timedelta(days=i)
            # Linear weight descent: 81.5kg down to 76.2kg with a tiny bit of random noise
            weight = 81.5 - (5.3 * (i / 30.0)) + random.uniform(-0.15, 0.15)
            # Slower LDL descent: 145 down to 108
            ldl = 145.0 - (37.0 * (i / 30.0)) + random.uniform(-1.0, 1.0)
            # Sleep hours: fluctuation around 7.2 hours
            sleep = 7.2 + random.uniform(-1.2, 1.5)
            sleep_min = sleep * 60.0
            sleep_score = 75.0 + random.uniform(-10.0, 15.0)
            # Active calories: around 350-450 kcal
            calories_burned = 380.0 + random.uniform(-80.0, 120.0)
            # Steps: around 8000-12000
            steps = 8000 + random.randint(-2000, 3000)
            # HRV: around 45-75 ms
            hrv = 55.0 + random.uniform(-10.0, 15.0)
            # Resting HR: around 55-65 bpm
            rhr = 60.0 + random.uniform(-5.0, 5.0)
            # Exercise: around 20-50 min
            exercise = 35.0 + random.uniform(-15.0, 25.0)
            # Sleep respiratory rate: around 14-18 breaths per min
            resp_rate = 15.5 + random.uniform(-1.5, 1.5)

            # SpO2: around 95-99%
            spo2 = 98.2 + random.uniform(-1.5, 1.3)
            # Body temp: around 36.5 - 37.1 °C
            body_temp = 36.7 + random.uniform(-0.3, 0.4)
            # Blood pressure: around 110-125 / 70-80
            systolic_bp = 117.0 + random.uniform(-5.0, 7.0)
            diastolic_bp = 75.0 + random.uniform(-4.0, 5.0)
            # Mindfulness minutes: 0 to 20 mins
            mindful = random.choice([0.0, 0.0, 10.0, 15.0, 20.0])
            # Flights climbed: 2 to 12
            flights = random.randint(2, 12)
            # Stand minutes: 40 to 90
            stand_min = random.uniform(40.0, 90.0)
            # BMR: around 1600-1700
            bmr = 1650.0 + random.uniform(-50.0, 50.0)
            # Audio exposure: around 45-65 dB
            audio_exp = 52.0 + random.uniform(-8.0, 12.0)
            # Six minute walking distance: around 500-650 m
            six_min_walk = 580.0 + random.uniform(-50.0, 70.0)

            # --- Extended Longevity & Gait Metrics ---
            bmi = weight / (1.78 ** 2)
            body_fat_pct = 22.0 - (2.5 * (i / 30.0)) + random.uniform(-0.15, 0.15)
            avg_hr = 72.0 + random.uniform(-4.0, 5.0)
            walking_hr = 92.0 + random.uniform(-5.0, 6.0)
            distance = (steps * 0.00078) + random.uniform(-0.2, 0.3)
            stand_hours = 12 + random.randint(-2, 3)
            daylight = 35.0 + random.uniform(-10.0, 20.0)
            wrist_temp = 36.4 + random.uniform(-0.25, 0.3)
            breathing_dist = max(0.0, round(2.5 + random.uniform(-1.5, 2.5), 1))
            walking_speed = 4.6 + random.uniform(-0.3, 0.4)
            step_length = 72.0 + random.uniform(-2.5, 3.0)
            walking_asymmetry = 0.4 + random.uniform(-0.15, 0.25)
            double_support = 28.5 + random.uniform(-1.0, 1.5)
            stair_up = 0.75 + random.uniform(-0.08, 0.12)
            stair_down = 0.90 + random.uniform(-0.10, 0.15)
 
            biometrics_to_add.extend([
                Biometric(user_id=user_uuid, ts=day_ts, metric="weight_kg", value=round(weight, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="ldl_cholesterol", value=round(ldl, 1), source="lab_corp"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="sleep_duration_min", value=round(sleep_min, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="sleep_score", value=round(sleep_score, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="active_kcal", value=round(calories_burned, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="steps", value=float(steps), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="hrv_ms", value=round(hrv, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="rhr_bpm", value=round(rhr, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="exercise_min", value=round(exercise, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="respiratory_rate_bpm", value=round(resp_rate, 1), source="apple_health"),
                
                # Vitals
                Biometric(user_id=user_uuid, ts=day_ts, metric="bmi", value=round(bmi, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="body_fat_pct", value=round(body_fat_pct, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="lean_body_mass_kg", value=round(weight * (1.0 - body_fat_pct / 100.0), 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="heart_rate_avg_bpm", value=round(avg_hr, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="walking_hr_bpm", value=round(walking_hr, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="spo2_pct", value=round(min(100.0, spo2), 1), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="body_temp_c", value=round(body_temp, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="bp_systolic_mmhg", value=round(systolic_bp, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="bp_diastolic_mmhg", value=round(diastolic_bp, 0), source="apple_health"),
                
                # Activity & Energy extras
                Biometric(user_id=user_uuid, ts=day_ts, metric="mindful_min", value=round(mindful, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="flights_climbed", value=float(flights), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="stand_min", value=round(stand_min, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="bmr_kcal", value=round(bmr, 0), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="audio_exposure_db", value=round(audio_exp, 1), source="apple_health"),
                
                # Longevity & Gait
                Biometric(user_id=user_uuid, ts=day_ts, metric="distance_km", value=round(distance, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="stand_hours", value=float(stand_hours), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="daylight_min", value=round(daylight, 1), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="wrist_temp_c", value=round(wrist_temp, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="breathing_disturbances", value=float(breathing_dist), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="walking_speed_kmh", value=round(walking_speed, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="step_length_cm", value=round(step_length, 1), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="walking_asymmetry_pct", value=round(walking_asymmetry, 3), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="double_support_pct", value=round(double_support, 2), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="stair_speed_up_mps", value=round(stair_up, 3), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="stair_speed_down_mps", value=round(stair_down, 3), source="apple_health"),
                Biometric(user_id=user_uuid, ts=day_ts, metric="six_min_walk_m", value=round(six_min_walk, 1), source="apple_health"),
            ])

        db.add_all(biometrics_to_add)

        # 5. Add Meal Events (14 days timeseries)
        print("Generating 14 days of realistic healthy dietary inputs (oatmeal, salmon, veggies)...")
        meal_events_to_add = []
        
        # Define high-fidelity template meals
        healthy_breakfast = {
            "slot": "breakfast",
            "source": "user",
            "items": ["oatmeal with blueberries", "chia seeds", "black coffee"],
            "nutrition": {"calories": 350.0, "saturated_fat_g": 0.5, "soluble_fiber_g": 6.5, "protein_g": 10.0}
        }
        indulgent_breakfast = {
            "slot": "breakfast",
            "source": "user",
            "items": ["bacon, egg, and cheese biscuit", "whole milk latte"],
            "nutrition": {"calories": 650.0, "saturated_fat_g": 14.5, "soluble_fiber_g": 0.5, "protein_g": 22.0}
        }
        
        healthy_lunch = {
            "slot": "lunch",
            "source": "user",
            "items": ["grilled salmon salad", "olive oil dressing", "quinoa"],
            "nutrition": {"calories": 550.0, "saturated_fat_g": 2.5, "soluble_fiber_g": 4.5, "protein_g": 38.0}
        }
        healthy_dinner = {
            "slot": "dinner",
            "source": "user",
            "items": ["lentil and vegetable stew", "steamed broccoli", "baked cod"],
            "nutrition": {"calories": 480.0, "saturated_fat_g": 1.0, "soluble_fiber_g": 8.0, "protein_g": 42.0}
        }
        indulgent_dinner = {
            "slot": "dinner",
            "source": "user",
            "items": ["double cheeseburger", "french fries", "soda"],
            "nutrition": {"calories": 1100.0, "saturated_fat_g": 22.0, "soluble_fiber_g": 1.5, "protein_g": 45.0}
        }
        
        snack = {
            "slot": "snack",
            "source": "user",
            "items": ["an apple", "handful of almonds"],
            "nutrition": {"calories": 180.0, "saturated_fat_g": 0.8, "soluble_fiber_g": 4.0, "protein_g": 5.0}
        }

        meal_start = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=14)
        for i in range(15):
            day_ts = meal_start + datetime.timedelta(days=i)
            
            # Make 80% of days highly compliant/healthy, and 20% of days indulgent
            is_healthy_day = random.random() < 0.8
            
            if is_healthy_day:
                # Compliant day
                breakfast_meal = healthy_breakfast
                lunch_meal = healthy_lunch
                dinner_meal = healthy_dinner
            else:
                # Indulgent day
                breakfast_meal = indulgent_breakfast if random.random() < 0.5 else healthy_breakfast
                lunch_meal = healthy_lunch
                dinner_meal = indulgent_dinner

            # Build timestamps for morning, noon, evening
            breakfast_ts = day_ts.replace(hour=8, minute=15, second=0, microsecond=0)
            lunch_ts = day_ts.replace(hour=12, minute=45, second=0, microsecond=0)
            dinner_ts = day_ts.replace(hour=19, minute=0, second=0, microsecond=0)

            meal_events_to_add.extend([
                MealEvent(user_id=user_uuid, ts=breakfast_ts, slot=breakfast_meal["slot"], source=breakfast_meal["source"], items=breakfast_meal["items"], nutrition=breakfast_meal["nutrition"]),
                MealEvent(user_id=user_uuid, ts=lunch_ts, slot=lunch_meal["slot"], source=lunch_meal["source"], items=lunch_meal["items"], nutrition=lunch_meal["nutrition"]),
                MealEvent(user_id=user_uuid, ts=dinner_ts, slot=dinner_meal["slot"], source=dinner_meal["source"], items=dinner_meal["items"], nutrition=dinner_meal["nutrition"]),
            ])

            if random.random() < 0.6:  # 60% chance of a snack
                snack_ts = day_ts.replace(hour=16, minute=30, second=0, microsecond=0)
                meal_events_to_add.append(
                    MealEvent(user_id=user_uuid, ts=snack_ts, slot=snack["slot"], source=snack["source"], items=snack["items"], nutrition=snack["nutrition"])
                )

        db.add_all(meal_events_to_add)
        await db.commit()

        # 6. Refresh continuous aggregates
        print("Refreshing TimescaleDB continuous aggregates (biometrics_daily)...")
        from luma.db.session import engine
        try:
            # We call TimescaleDB's refresh function to aggregate raw biometric data
            # This requires autocommit mode to run outside a transaction block
            async with engine.connect() as conn:
                conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
                await conn.execute(text("CALL refresh_continuous_aggregate('biometrics_daily', NULL, NULL)"))
            print("Successfully refreshed continuous aggregate.")
        except Exception as exc:
            # Fallback/soft warning if not running in TimescaleDB or under a test setup where it fails
            print(f"Warning: could not manually refresh continuous aggregates: {exc}. Values will populate on next automatic refresh.")

    print("\n🎉 Done! High-fidelity mock data successfully generated!")
    print("  - 31 days of weight logs (~81.5 kg -> ~76.2 kg)")
    print("  - 31 days of LDL logs (~145 mg/dL -> ~108 mg/dL)")
    print("  - 31 days of 27+ HAE, longevity & gait metrics (blood oxygen, body temp, blood pressure, walking speed, asymmetry, step length, breathing, etc.)")
    print("  - 15 days of breakfasts, lunches, and dinners")
    print("  - Calorie, fat, and fiber goals properly wired.")
    print("  - Four categorized hubs: Recovery, Activity, Gait & Posture, Vitals")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed mock metrics and food logs for a user.")
    parser.add_argument("user_id", help="The UUID of the user to seed data for.")
    args = parser.parse_args()

    asyncio.run(seed_data(args.user_id))
