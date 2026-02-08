"""
Generate GoTours app icons - a taxi/ride-hailing app.
Creates a modern icon with a location pin and car motif.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import os

def create_icon(size=1024):
    """Create the main GoTours app icon."""
    # Solid dark background - NO transparency (required for Play Store)
    img = Image.new('RGBA', (size, size), (23, 23, 23, 255))
    draw = ImageDraw.Draw(img)

    # === Draw Location Pin ===
    pin_color = (255, 193, 7, 255)  # Golden yellow (#FFC107)
    pin_highlight = (255, 213, 79, 255)  # Lighter yellow

    cx = size // 2  # center x
    pin_top = int(size * 0.08)
    pin_bottom = int(size * 0.82)
    circle_radius = int(size * 0.28)
    circle_cy = pin_top + circle_radius + int(size * 0.06)

    # Draw pin body (circle + triangle pointer)
    # Triangle (pointer at bottom)
    triangle_width = int(size * 0.16)
    triangle_top = circle_cy + circle_radius - int(size * 0.06)
    triangle_points = [
        (cx - triangle_width, triangle_top),
        (cx + triangle_width, triangle_top),
        (cx, pin_bottom)
    ]
    draw.polygon(triangle_points, fill=pin_color)

    # Main circle
    draw.ellipse(
        [
            (cx - circle_radius, circle_cy - circle_radius),
            (cx + circle_radius, circle_cy + circle_radius)
        ],
        fill=pin_color
    )

    # Inner circle (dark cutout for car icon area)
    inner_radius = int(circle_radius * 0.72)
    draw.ellipse(
        [
            (cx - inner_radius, circle_cy - inner_radius),
            (cx + inner_radius, circle_cy + inner_radius)
        ],
        fill=(30, 30, 30, 255)
    )

    # === Draw a simplified car inside the inner circle ===
    car_color = (255, 255, 255, 255)  # White car

    # Car body - main rectangle
    car_w = int(inner_radius * 1.2)
    car_h = int(inner_radius * 0.38)
    car_top = circle_cy - int(car_h * 0.3)
    car_left = cx - car_w // 2
    car_right = cx + car_w // 2

    # Car roof (smaller trapezoid/rounded rect on top)
    roof_w = int(car_w * 0.55)
    roof_h = int(car_h * 0.75)
    roof_left = cx - roof_w // 2
    roof_right = cx + roof_w // 2
    roof_top = car_top - roof_h
    roof_bottom = car_top + int(car_h * 0.15)

    # Draw roof with rounded top
    draw.rounded_rectangle(
        [(roof_left, roof_top), (roof_right, roof_bottom)],
        radius=int(roof_h * 0.4),
        fill=car_color
    )

    # Car body (main lower part) with rounded corners
    draw.rounded_rectangle(
        [(car_left, car_top), (car_right, car_top + car_h)],
        radius=int(car_h * 0.35),
        fill=car_color
    )

    # Wheels
    wheel_radius = int(car_h * 0.32)
    wheel_y = car_top + car_h
    left_wheel_x = car_left + int(car_w * 0.22)
    right_wheel_x = car_right - int(car_w * 0.22)

    # Wheel wells (dark background behind wheels)
    for wx in [left_wheel_x, right_wheel_x]:
        draw.ellipse(
            [
                (wx - wheel_radius - 2, wheel_y - wheel_radius - 2),
                (wx + wheel_radius + 2, wheel_y + wheel_radius + 2)
            ],
            fill=(30, 30, 30, 255)
        )
        # Wheel (tire)
        draw.ellipse(
            [
                (wx - wheel_radius, wheel_y - wheel_radius),
                (wx + wheel_radius, wheel_y + wheel_radius)
            ],
            fill=car_color
        )
        # Wheel hub
        hub_r = int(wheel_radius * 0.5)
        draw.ellipse(
            [
                (wx - hub_r, wheel_y - hub_r),
                (wx + hub_r, wheel_y + hub_r)
            ],
            fill=(30, 30, 30, 255)
        )

    # === Add "GoTours" text at bottom ===
    text = "GoTours"
    text_y = int(size * 0.85)

    # Try to use a good font, fallback to default
    font_size = int(size * 0.10)
    try:
        # Try common Windows fonts
        for font_path in [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf",
        ]:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, font_size)
                break
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    # Try bold version
    try:
        for font_path in [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/calibrib.ttf",
        ]:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, font_size)
                break
    except:
        pass

    # Draw text centered
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (size - text_w) // 2

    # Text with slight shadow for depth
    draw.text((text_x + 3, text_y + 3), text, fill=(0, 0, 0, 180), font=font)
    draw.text((text_x, text_y), text, fill=(255, 193, 7, 255), font=font)  # Yellow to match pin

    return img


def create_adaptive_icon(size=1024):
    """Create adaptive icon foreground (transparent background, centered content)."""
    # For adaptive icons, content should be in the center 66% (safe zone)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale everything to fit within the safe zone
    safe_margin = int(size * 0.17)  # ~17% margin on each side
    safe_size = size - 2 * safe_margin

    # === Draw Location Pin (centered in safe zone) ===
    pin_color = (255, 193, 7, 255)  # Golden yellow

    cx = size // 2
    pin_top = safe_margin + int(safe_size * 0.02)
    pin_bottom = safe_margin + int(safe_size * 0.78)
    circle_radius = int(safe_size * 0.26)
    circle_cy = pin_top + circle_radius + int(safe_size * 0.05)

    # Triangle pointer
    triangle_width = int(safe_size * 0.14)
    triangle_top = circle_cy + circle_radius - int(safe_size * 0.05)
    triangle_points = [
        (cx - triangle_width, triangle_top),
        (cx + triangle_width, triangle_top),
        (cx, pin_bottom)
    ]
    draw.polygon(triangle_points, fill=pin_color)

    # Main circle
    draw.ellipse(
        [
            (cx - circle_radius, circle_cy - circle_radius),
            (cx + circle_radius, circle_cy + circle_radius)
        ],
        fill=pin_color
    )

    # Inner dark circle
    inner_radius = int(circle_radius * 0.72)
    draw.ellipse(
        [
            (cx - inner_radius, circle_cy - inner_radius),
            (cx + inner_radius, circle_cy + inner_radius)
        ],
        fill=(23, 23, 23, 255)
    )

    # === Car inside ===
    car_color = (255, 255, 255, 255)
    car_w = int(inner_radius * 1.2)
    car_h = int(inner_radius * 0.38)
    car_top = circle_cy - int(car_h * 0.3)
    car_left = cx - car_w // 2
    car_right = cx + car_w // 2

    # Roof
    roof_w = int(car_w * 0.55)
    roof_h = int(car_h * 0.75)
    roof_left = cx - roof_w // 2
    roof_right = cx + roof_w // 2
    roof_top = car_top - roof_h
    roof_bottom = car_top + int(car_h * 0.15)

    draw.rounded_rectangle(
        [(roof_left, roof_top), (roof_right, roof_bottom)],
        radius=int(roof_h * 0.4),
        fill=car_color
    )

    # Car body
    draw.rounded_rectangle(
        [(car_left, car_top), (car_right, car_top + car_h)],
        radius=int(car_h * 0.35),
        fill=car_color
    )

    # Wheels
    wheel_radius = int(car_h * 0.32)
    wheel_y = car_top + car_h
    left_wheel_x = car_left + int(car_w * 0.22)
    right_wheel_x = car_right - int(car_w * 0.22)

    for wx in [left_wheel_x, right_wheel_x]:
        draw.ellipse(
            [(wx - wheel_radius - 2, wheel_y - wheel_radius - 2),
             (wx + wheel_radius + 2, wheel_y + wheel_radius + 2)],
            fill=(23, 23, 23, 255)
        )
        draw.ellipse(
            [(wx - wheel_radius, wheel_y - wheel_radius),
             (wx + wheel_radius, wheel_y + wheel_radius)],
            fill=car_color
        )
        hub_r = int(wheel_radius * 0.5)
        draw.ellipse(
            [(wx - hub_r, wheel_y - hub_r),
             (wx + hub_r, wheel_y + hub_r)],
            fill=(23, 23, 23, 255)
        )

    # "GoTours" text below pin
    text = "GoTours"
    text_y = pin_bottom + int(safe_size * 0.04)
    font_size = int(safe_size * 0.11)

    try:
        for font_path in [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, font_size)
                break
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (size - text_w) // 2
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)

    return img


def create_splash_icon(size=1024):
    """Create splash screen icon (just the logo, no background)."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Larger, centered version for splash
    cx = size // 2

    pin_color = (255, 193, 7, 255)

    # Pin - bigger for splash
    circle_radius = int(size * 0.22)
    circle_cy = int(size * 0.35)

    # Triangle
    triangle_width = int(size * 0.12)
    triangle_top = circle_cy + circle_radius - int(size * 0.04)
    pin_bottom = int(size * 0.68)
    triangle_points = [
        (cx - triangle_width, triangle_top),
        (cx + triangle_width, triangle_top),
        (cx, pin_bottom)
    ]
    draw.polygon(triangle_points, fill=pin_color)

    # Circle
    draw.ellipse(
        [(cx - circle_radius, circle_cy - circle_radius),
         (cx + circle_radius, circle_cy + circle_radius)],
        fill=pin_color
    )

    # Inner dark circle
    inner_radius = int(circle_radius * 0.72)
    draw.ellipse(
        [(cx - inner_radius, circle_cy - inner_radius),
         (cx + inner_radius, circle_cy + inner_radius)],
        fill=(23, 23, 23, 255)
    )

    # Car
    car_color = (255, 255, 255, 255)
    car_w = int(inner_radius * 1.2)
    car_h = int(inner_radius * 0.38)
    car_top = circle_cy - int(car_h * 0.3)
    car_left = cx - car_w // 2
    car_right = cx + car_w // 2

    roof_w = int(car_w * 0.55)
    roof_h = int(car_h * 0.75)
    roof_left = cx - roof_w // 2
    roof_right = cx + roof_w // 2
    roof_top = car_top - roof_h
    roof_bottom = car_top + int(car_h * 0.15)

    draw.rounded_rectangle(
        [(roof_left, roof_top), (roof_right, roof_bottom)],
        radius=int(roof_h * 0.4),
        fill=car_color
    )
    draw.rounded_rectangle(
        [(car_left, car_top), (car_right, car_top + car_h)],
        radius=int(car_h * 0.35),
        fill=car_color
    )

    # Wheels
    wheel_radius = int(car_h * 0.32)
    wheel_y = car_top + car_h
    for wx in [car_left + int(car_w * 0.22), car_right - int(car_w * 0.22)]:
        draw.ellipse(
            [(wx - wheel_radius - 2, wheel_y - wheel_radius - 2),
             (wx + wheel_radius + 2, wheel_y + wheel_radius + 2)],
            fill=(23, 23, 23, 255)
        )
        draw.ellipse(
            [(wx - wheel_radius, wheel_y - wheel_radius),
             (wx + wheel_radius, wheel_y + wheel_radius)],
            fill=car_color
        )
        hub_r = int(wheel_radius * 0.5)
        draw.ellipse(
            [(wx - hub_r, wheel_y - hub_r),
             (wx + hub_r, wheel_y + hub_r)],
            fill=(23, 23, 23, 255)
        )

    # "GoTours" text
    text = "GoTours"
    font_size = int(size * 0.12)
    try:
        for font_path in [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, font_size)
                break
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    text_y = pin_bottom + int(size * 0.04)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (size - text_w) // 2
    draw.text((text_x, text_y), text, fill=(255, 193, 7, 255), font=font)

    return img


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    print("Generating GoTours icons...")

    # Generate main icon (1024x1024)
    icon = create_icon(1024)

    # Generate adaptive icon foreground (1024x1024)
    adaptive = create_adaptive_icon(1024)

    # Generate splash icon (1024x1024)
    splash = create_splash_icon(1024)

    # Generate favicon (48x48) from main icon
    favicon = icon.resize((48, 48), Image.LANCZOS)

    # Save to mobile/assets/
    mobile_assets = os.path.join(base_dir, "mobile", "assets")
    icon.save(os.path.join(mobile_assets, "icon.png"), "PNG")
    adaptive.save(os.path.join(mobile_assets, "adaptive-icon.png"), "PNG")
    splash.save(os.path.join(mobile_assets, "splash-icon.png"), "PNG")
    favicon.save(os.path.join(mobile_assets, "favicon.png"), "PNG")
    print(f"Saved icons to {mobile_assets}")

    # Save to mobile-driver/assets/
    driver_assets = os.path.join(base_dir, "mobile-driver", "assets")
    icon.save(os.path.join(driver_assets, "icon.png"), "PNG")
    adaptive.save(os.path.join(driver_assets, "adaptive-icon.png"), "PNG")
    splash.save(os.path.join(driver_assets, "splash-icon.png"), "PNG")
    splash.save(os.path.join(driver_assets, "splash.png"), "PNG")  # driver uses splash.png too
    favicon.save(os.path.join(driver_assets, "favicon.png"), "PNG")
    print(f"Saved icons to {driver_assets}")

    print("Done! All icons generated successfully.")


if __name__ == "__main__":
    main()
