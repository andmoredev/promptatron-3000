/**
 * @fileoverview ChadFace component that renders SVG-based Chad personality with hat and polo shirt
 */

import { useTheme } from "../ThemeProvider.jsx";
import { getThemeColor } from "../../utils/themeUtils.js";
import { robotFacePropTypes, robotFaceDefaultProps } from "./propTypes.js";
import { getAccessibleColors } from "./accessibility.js";
import "./RobotFaceAnimations.css";

/**
 * ChadFace component that renders Chad personality with hat and polo shirt styling
 * @param {Object} props - Component props
 * @param {string} props.expression - The facial expression to render ('happy', 'thinking', 'talking', 'concerned')
 * @param {boolean} [props.animated=true] - Whether to enable animations
 * @param {string} [props.size='md'] - Size variant for scaling
 * @param {Object} [props.theme] - Theme object for color customization
 * @returns {JSX.Element} The ChadFace SVG component
 */
const ChadFace = ({
  expression,
  animated = true,
  size = "md",
  theme: propTheme,
}) => {
  const contextTheme = useTheme();
  const theme = propTheme || contextTheme;

  // Size configurations for SVG scaling
  const sizeMap = {
    sm: { width: 40, height: 40, scale: 0.8 },
    md: { width: 56, height: 56, scale: 1.0 },
    lg: { width: 80, height: 80, scale: 1.2 },
  };

  const { width, height, scale } = sizeMap[size] || sizeMap.md;

  // Get theme colors with fallbacks ensuring proper contrast ratios
  const baseColors = {
    robotBody: getThemeColor("primary", 50, theme) || "#f8fafc",
    robotStroke: getThemeColor("gray", 600, theme) || "#475569",
    happyMouth: getThemeColor("primary", 700, theme) || "#047857",
    thinkingMouth: getThemeColor("secondary", 700, theme) || "#b45309",
    thinkingBg: getThemeColor("secondary", 50, theme) || "#fefce8",
    thinkingSecondary: getThemeColor("secondary", 500, theme) || "#f59e0b",
    thinkingTertiary: getThemeColor("secondary", 400, theme) || "#fbbf24",
    talkingElements: getThemeColor("primary", 600, theme) || "#2563eb",
    talkingBg: getThemeColor("primary", 50, theme) || "#eff6ff",
    talkingSecondary: getThemeColor("primary", 500, theme) || "#3b82f6",
    talkingTertiary: getThemeColor("primary", 400, theme) || "#60a5fa",
    errorElements: getThemeColor("tertiary", 700, theme) || "#b91c1c",
    errorBg: getThemeColor("tertiary", 50, theme) || "#fef2f2",
    eyeColor: "#0f172a",
    whiteHighlight: "#ffffff",
    // Chad-specific colors
    hatColor: getThemeColor("green", 300, theme) || "#86efac", // Light green baseball cap
    hatVisorColor: getThemeColor("green", 700, theme) || "#15803d", // Darker green for visor
    shirtColor: "#fce7f3", // Pink polo shirt
    collarColor: getThemeColor("gray", 200, theme) || "#e5e7eb",
    buttonColor: getThemeColor("gray", 400, theme) || "#9ca3af",
  };

  // Apply accessibility adjustments for high contrast and forced colors
  const colors = getAccessibleColors(baseColors);

  // Common SVG props with accessibility attributes
  const svgProps = {
    width,
    height,
    viewBox: "0 0 100 135",
    className: `robot-face-svg robot-expression-${expression} chad-face ${
      animated ? "robot-animated" : "robot-static"
    }`,
    "data-testid": "chad-face-svg",
    role: "presentation",
    "aria-hidden": "true",
    focusable: "false",
  };

  // Render different expressions based on the expression prop
  const renderExpression = () => {
    switch (expression) {
      case "happy":
        return renderHappyExpression(animated, colors);
      case "thinking":
        return renderThinkingExpression(animated, colors);
      case "talking":
        return renderTalkingExpression(animated, colors);
      case "concerned":
        return renderConcernedExpression(animated, colors);
      default:
        return renderHappyExpression(animated, colors);
    }
  };

  return <svg {...svgProps}>{renderExpression()}</svg>;
};

/**
 * Renders Chad's baseball cap hat
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for the hat
 */
const renderChadHat = (colors) => (
  <g className="chad-hat" transform="rotate(-25 50 18)">
    {/* Hat crown - rotated sideways */}
    <ellipse
      cx="50"
      cy="18"
      rx="28"
      ry="12"
      fill={colors.hatColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Hat crown shadow for depth */}
    <ellipse
      cx="52"
      cy="19"
      rx="26"
      ry="11"
      fill={colors.hatColor}
      opacity="0.7"
    />

    {/* Hat brim shadow/back - positioned for sideways look */}
    <ellipse
      cx="75"
      cy="20"
      rx="35"
      ry="9"
      fill={colors.hatVisorColor}
      opacity="0.6"
    />

    {/* Hat brim main - extending to the right */}
    <ellipse
      cx="73"
      cy="19"
      rx="36"
      ry="10"
      fill={colors.hatVisorColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Hat brim highlight */}
    <ellipse
      cx="71"
      cy="18"
      rx="32"
      ry="8"
      fill={colors.whiteHighlight}
      opacity="0.15"
    />

    {/* Hat brim underside shadow */}
    <ellipse
      cx="73"
      cy="21"
      rx="34"
      ry="8"
      fill="none"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
      opacity="0.4"
    />

    {/* Hat button/logo - positioned on the visible side */}
    <circle
      cx="45"
      cy="15"
      r="2"
      fill={colors.whiteHighlight}
      stroke={colors.robotStroke}
      strokeWidth="0.5"
    />

    {/* Hat adjustment strap - visible on the back */}
    <rect
      x="25"
      y="20"
      width="6"
      height="2"
      rx="1"
      fill={colors.hatVisorColor}
      opacity="0.8"
    />
  </g>
);

/**
 * Renders Chad's hair
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for the hair
 */
const renderChadHair = (colors) => (
  <g className="chad-hair">
    {/* Hair base/shadow - removed for all-spike look */}
    {/* <path
      d="M 15 25 Q 20 17 27 15 Q 34 13 40 14 Q 47 12 50 13 Q 53 12 60 14 Q 66 13 73 15 Q 80 17 85 25 Q 85 35 80 40 Q 70 35 50 35 Q 30 35 20 40 Q 15 35 15 25 Z"
      fill="#1a1a1a"
      opacity="0.8"
    /> */}

    {/* Main hair volume - removed for all-spike look */}
    {/* <path
      d="M 12 25 Q 18 15 25 13 Q 32 11 38 12 Q 45 10 50 11 Q 55 10 62 12 Q 68 11 75 13 Q 82 15 88 25 Q 88 38 82 42 Q 72 38 50 38 Q 28 38 18 42 Q 12 38 12 25 Z"
      fill="#0f0f0f"
      stroke={colors.robotStroke}
      strokeWidth="0.8"
    /> */}

    {/* Scattered Yellow Frosted Tips - Natural Distribution */}
    <g className="frosted-tips">
      {/* Tip 1 - Far left, shorter */}
      <path
        d="M 22 20 L 24 12 L 26 19 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 23 18 L 24 14 L 25 17 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 2 - Left side, medium */}
      <path
        d="M 30 17 L 32 9 L 34 18 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 31 15 L 32 11 L 33 16 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 3 - Left-center, tall */}
      <path
        d="M 38 16 L 40 7 L 42 17 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 39 14 L 40 9 L 41 15 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 4 - Center-left, very tall */}
      <path
        d="M 45 15 L 47 5 L 49 16 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 46 13 L 47 7 L 48 14 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 5 - Center-right, tall */}
      <path
        d="M 53 14 L 55 6 L 57 16 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 54 12 L 55 8 L 56 14 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 6 - Right-center, medium */}
      <path
        d="M 61 17 L 63 8 L 65 18 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 62 15 L 63 10 L 64 16 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 7 - Right side, shorter */}
      <path
        d="M 69 19 L 71 11 L 73 20 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 70 17 L 71 13 L 72 18 Z" fill="#ffed4e" opacity="0.8" />

      {/* Tip 8 - Far right, short */}
      <path
        d="M 76 21 L 78 13 L 80 22 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.5"
      />
      <path d="M 77 19 L 78 15 L 79 20 Z" fill="#ffed4e" opacity="0.8" />

      {/* Additional scattered tips for natural look */}
      {/* Small tip between main ones */}
      <path
        d="M 35 19 L 36 14 L 37 20 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.4"
      />

      {/* Another small tip */}
      <path
        d="M 51 17 L 52 12 L 53 18 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.4"
      />

      {/* Small tip on right */}
      <path
        d="M 66 20 L 67 15 L 68 21 Z"
        fill="#ffd700"
        stroke="#ffed4e"
        strokeWidth="0.4"
      />
    </g>

    {/* Lighter Hair Spikes - Individual spiky sections */}
    <g className="hair-spikes">
      {/* Left side lighter spikes */}
      <path
        d="M 18 22 L 20 16 L 22 23 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 26 20 L 28 14 L 30 21 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 33 19 L 35 13 L 37 20 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />

      {/* Center lighter spikes */}
      <path
        d="M 41 18 L 43 11 L 45 19 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 48 17 L 50 10 L 52 18 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 56 18 L 58 11 L 60 19 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />

      {/* Right side lighter spikes */}
      <path
        d="M 63 19 L 65 13 L 67 20 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 70 20 L 72 14 L 74 21 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />
      <path
        d="M 78 22 L 80 16 L 82 23 Z"
        fill="#5a5a5a"
        stroke="#3a3a3a"
        strokeWidth="0.4"
      />

      {/* Additional smaller lighter spikes for texture */}
      <path
        d="M 24 21 L 25 18 L 26 22 Z"
        fill="#4a4a4a"
        stroke="#3a3a3a"
        strokeWidth="0.3"
      />
      <path
        d="M 39 20 L 40 17 L 41 21 Z"
        fill="#4a4a4a"
        stroke="#3a3a3a"
        strokeWidth="0.3"
      />
      <path
        d="M 54 19 L 55 16 L 56 20 Z"
        fill="#4a4a4a"
        stroke="#3a3a3a"
        strokeWidth="0.3"
      />
      <path
        d="M 68 21 L 69 18 L 70 22 Z"
        fill="#4a4a4a"
        stroke="#3a3a3a"
        strokeWidth="0.3"
      />
      <path
        d="M 75 22 L 76 19 L 77 23 Z"
        fill="#4a4a4a"
        stroke="#3a3a3a"
        strokeWidth="0.3"
      />
    </g>

    {/* Hair texture strands - subtle lines between spikes */}
    <path
      d="M 29 19 Q 30 17 31 19"
      fill="none"
      stroke="#1a1a1a"
      strokeWidth="0.5"
      opacity="0.4"
    />
    <path
      d="M 46 18 Q 47 16 48 18"
      fill="none"
      stroke="#1a1a1a"
      strokeWidth="0.5"
      opacity="0.4"
    />
    <path
      d="M 61 19 Q 62 17 63 19"
      fill="none"
      stroke="#1a1a1a"
      strokeWidth="0.5"
      opacity="0.4"
    />

    {/* Side hair wisps - removed for all-spike look */}
    {/* <path
      d="M 12 30 Q 8 25 10 35 Q 15 38 20 35"
      fill="#0f0f0f"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
    />
    <path
      d="M 88 30 Q 92 25 90 35 Q 85 38 80 35"
      fill="#0f0f0f"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
    /> */}
  </g>
);

/**
 * Renders Chad's white visor angled upward with 3D perspective
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for the visor
 */
const renderChadVisor = (colors) => (
  <g className="chad-visor">
    {/* Left side band - angled upward */}
    <path
      d="M 12 35 Q 18 25 28 23 Q 35 22 42 20 L 40 38 Q 32 40 28 39 Q 18 41 12 35 Z"
      fill="#ffffff"
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Right side band - angled upward */}
    <path
      d="M 88 35 Q 82 25 72 23 Q 65 22 58 20 L 60 38 Q 68 40 72 39 Q 82 41 88 35 Z"
      fill="#ffffff"
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Visor front brim - angled upward for confident look */}
    <path
      d="M 18 28 Q 25 18 35 15 Q 50 12 65 15 Q 75 18 82 28 Q 75 32 65 30 Q 50 28 35 30 Q 25 32 18 28 Z"
      fill="#ffffff"
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Visor brim shadow - angled upward */}
    <path
      d="M 20 29 Q 27 19 37 16 Q 50 13 63 16 Q 73 19 80 29 Q 73 33 63 31 Q 50 29 37 31 Q 27 33 20 29 Z"
      fill="#f0f0f0"
      opacity="0.6"
    />

    {/* Visor brim highlight - angled upward */}
    <path
      d="M 22 27 Q 28 19 38 16 Q 50 14 62 16 Q 72 19 78 27 Q 72 30 62 29 Q 50 27 38 29 Q 28 30 22 27 Z"
      fill={colors.whiteHighlight}
      opacity="0.3"
    />

    {/* Left side band highlight - angled upward */}
    <path
      d="M 18 30 Q 25 22 35 20 Q 38 19 40 20 L 38 30 Q 35 29 32 28 Q 25 30 18 30 Z"
      fill={colors.whiteHighlight}
      opacity="0.2"
    />

    {/* Right side band highlight - angled upward */}
    <path
      d="M 82 30 Q 75 22 65 20 Q 62 19 60 20 L 62 30 Q 65 29 68 28 Q 75 30 82 30 Z"
      fill={colors.whiteHighlight}
      opacity="0.2"
    />

    {/* Visor adjustment mechanism on the right side */}
    <rect
      x="85"
      y="31"
      width="4"
      height="5"
      rx="1"
      fill="#e0e0e0"
      stroke={colors.robotStroke}
      strokeWidth="0.3"
    />

    {/* Velcro/adjustment strap detail */}
    <rect x="86" y="32" width="2" height="3" fill="#d0d0d0" />

    {/* Small logo on front visor - positioned on angled brim */}
    <circle cx="45" cy="25" r="1.8" fill={colors.hatColor} opacity="0.9" />
    <circle cx="45" cy="25" r="1" fill={colors.whiteHighlight} opacity="0.7" />

    {/* Visor underside shadow - shows the upward angle */}
    <path
      d="M 20 30 Q 30 22 40 19 Q 50 17 60 19 Q 70 22 80 30"
      fill="none"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
      opacity="0.3"
    />
  </g>
);

/**
 * Renders Chad's neck area
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for the neck
 */
const renderChadNeck = (colors) => (
  <g className="chad-neck">
    {/* Neck cylinder */}
    <rect
      x="35"
      y="70"
      width="30"
      height="12"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Neck top ellipse */}
    <ellipse
      cx="50"
      cy="70"
      rx="15"
      ry="3"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Neck bottom ellipse */}
    <ellipse
      cx="50"
      cy="82"
      rx="15"
      ry="3"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Neck panel lines for tech aesthetic */}
    <line
      x1="37"
      y1="74"
      x2="63"
      y2="74"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
      opacity="0.3"
    />
    <line
      x1="37"
      y1="78"
      x2="63"
      y2="78"
      stroke={colors.robotStroke}
      strokeWidth="0.5"
      opacity="0.3"
    />
  </g>
);

/**
 * Renders Chad's polo shirt
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for the polo shirt
 */
const renderChadShirt = (colors) => (
  <g className="chad-shirt">
    {/* Shirt body */}
    <rect
      x="10"
      y="82"
      width="80"
      height="30"
      fill={colors.shirtColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Left collar flap - opened/folded back */}
    <path
      d="M 35 82 L 42 75 L 47 74 L 45 84 L 40 87 Z"
      fill={colors.shirtColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Right collar flap - opened/folded back */}
    <path
      d="M 65 82 L 58 75 L 53 74 L 55 84 L 60 87 Z"
      fill={colors.shirtColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Collar fold lines */}
    <line
      x1="42"
      y1="75"
      x2="40"
      y2="87"
      stroke={colors.collarColor}
      strokeWidth="1"
    />
    <line
      x1="58"
      y1="75"
      x2="60"
      y2="87"
      stroke={colors.collarColor}
      strokeWidth="1"
    />

    {/* Inner collar edges to show depth */}
    <line
      x1="47"
      y1="74"
      x2="45"
      y2="84"
      stroke={colors.collarColor}
      strokeWidth="0.5"
    />
    <line
      x1="53"
      y1="74"
      x2="55"
      y2="84"
      stroke={colors.collarColor}
      strokeWidth="0.5"
    />

    {/* Shirt opening/placket area - V-shaped opening */}
    <path
      d="M 47 74 L 50 73 L 53 74 L 52 90 L 48 90 Z"
      fill={colors.shirtColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
    />

    {/* Opening edges to show depth */}
    <line
      x1="48"
      y1="90"
      x2="47"
      y2="74"
      stroke={colors.collarColor}
      strokeWidth="0.5"
    />
    <line
      x1="52"
      y1="90"
      x2="53"
      y2="74"
      stroke={colors.collarColor}
      strokeWidth="0.5"
    />

    {/* Polo shirt buttons - positioned on the opening flaps */}
    <circle
      cx="48"
      cy="84"
      r="1.2"
      fill={colors.buttonColor}
      stroke={colors.robotStroke}
      strokeWidth="0.5"
    />
    <circle
      cx="52"
      cy="88"
      r="1.2"
      fill={colors.buttonColor}
      stroke={colors.robotStroke}
      strokeWidth="0.5"
    />

    {/* Button holes */}
    <circle cx="48" cy="84" r="0.2" fill={colors.robotStroke} />
    <circle cx="52" cy="88" r="0.2" fill={colors.robotStroke} />

    {/* Mini logo on left chest */}
    <g className="polo-logo">
      {/* Logo background circle */}
      <circle
        cx="25"
        cy="95"
        r="3"
        fill={colors.whiteHighlight}
        stroke={colors.robotStroke}
        strokeWidth="0.3"
        opacity="0.9"
      />

      {/* Logo symbol - simple geometric design */}
      <path
        d="M 23 94 L 25 92 L 27 94 L 25 96 Z"
        fill={colors.hatColor}
        stroke={colors.robotStroke}
        strokeWidth="0.2"
      />

      {/* Logo accent dot */}
      <circle cx="25" cy="94" r="0.5" fill={colors.hatVisorColor} />
    </g>
  </g>
);

/**
 * Renders a happy Chad expression
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for happy Chad expression
 */
const renderHappyExpression = (animated, colors) => (
  <g className="chad-face-happy">
    {/* Chad's neck */}
    {renderChadNeck(colors)}

    {/* Chad's polo shirt */}
    {renderChadShirt(colors)}

    {/* Robot head - bigger and rounder, shortened to show more collar */}
    <rect
      x="8"
      y="20"
      width="84"
      height="58"
      rx="28"
      ry="28"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line
      x1="16"
      y1="30"
      x2="84"
      y2="30"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />
    <line
      x1="16"
      y1="70"
      x2="84"
      y2="70"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />

    {/* Eyes - rectangular LED-style displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />
      <rect
        x="62"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />

      {/* LED indicators inside eyes */}
      <circle
        cx="29"
        cy="44"
        r="1.2"
        fill={colors.happyMouth}
        className="robot-eye-led"
      />
      <circle
        cx="35"
        cy="44"
        r="1.2"
        fill={colors.happyMouth}
        className="robot-eye-led"
      />
      <circle
        cx="65"
        cy="44"
        r="1.2"
        fill={colors.happyMouth}
        className="robot-eye-led"
      />
      <circle
        cx="71"
        cy="44"
        r="1.2"
        fill={colors.happyMouth}
        className="robot-eye-led"
      />
    </g>

    {/* Happy mouth - LED strip style */}
    <rect
      x="32"
      y="58"
      width="36"
      height="6"
      rx="3"
      fill={colors.happyMouth}
      className="robot-mouth robot-mouth-happy"
    />

    {/* Mouth segments for LED effect */}
    <rect
      x="34"
      y="60"
      width="4"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.8"
    />
    <rect
      x="40"
      y="60"
      width="4"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.6"
    />
    <rect
      x="46"
      y="60"
      width="4"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.8"
    />
    <rect
      x="52"
      y="60"
      width="4"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.6"
    />
    <rect
      x="58"
      y="60"
      width="4"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.8"
    />
    <rect
      x="64"
      y="60"
      width="2"
      height="2"
      fill={colors.whiteHighlight}
      opacity="0.4"
    />

    {/* Status indicators */}
    <circle
      cx="22"
      cy="32"
      r="1.5"
      fill={colors.happyMouth}
      className="robot-status-led"
    />
    <circle
      cx="78"
      cy="32"
      r="1.5"
      fill={colors.happyMouth}
      className="robot-status-led"
    />

    {/* Chad's hair */}
    {renderChadHair(colors)}

    {/* Chad's white visor - removed */}
    {/* {renderChadVisor(colors)} */}

    {/* Chad's baseball cap - temporarily hidden */}
    {/* {renderChadHat(colors)} */}

    {/* Chad's name label */}
    <text
      x="50"
      y="125"
      textAnchor="middle"
      fill={colors.robotStroke}
      fontSize="12"
      fontWeight="bold"
      fontFamily="Arial, sans-serif"
      className="chad-name-label"
    >
      CHAD
    </text>
  </g>
);

/**
 * Renders a thinking Chad expression
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for thinking Chad expression
 */
const renderThinkingExpression = (animated, colors) => (
  <g className="chad-face-thinking">
    {/* Chad's neck */}
    {renderChadNeck(colors)}

    {/* Chad's polo shirt */}
    {renderChadShirt(colors)}

    {/* Robot head - bigger and rounder, shortened to show more collar */}
    <rect
      x="8"
      y="20"
      width="84"
      height="58"
      rx="28"
      ry="28"
      fill={colors.thinkingBg || "#fefce8"}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line
      x1="16"
      y1="30"
      x2="84"
      y2="30"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />
    <line
      x1="16"
      y1="70"
      x2="84"
      y2="70"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />

    {/* Eyes - narrowed rectangular displays for concentration */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="44"
        width="12"
        height="4"
        rx="1"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />
      <rect
        x="62"
        y="44"
        width="12"
        height="4"
        rx="1"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Scanning LED indicators */}
      <rect
        x="27"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        className="robot-eye-led"
      />
      <rect
        x="30"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        opacity="0.6"
      />
      <rect
        x="33"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        opacity="0.3"
      />
      <rect
        x="63"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        className="robot-eye-led"
      />
      <rect
        x="66"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        opacity="0.6"
      />
      <rect
        x="69"
        y="45"
        width="1.5"
        height="2"
        fill={colors.thinkingMouth}
        opacity="0.3"
      />
    </g>

    {/* Processing indicator mouth */}
    <rect
      x="36"
      y="62"
      width="28"
      height="4"
      rx="2"
      fill={colors.thinkingMouth}
      className="robot-mouth robot-mouth-thinking"
    />

    {/* Processing dots */}
    <circle
      cx="40"
      cy="64"
      r="0.8"
      fill={colors.whiteHighlight}
      opacity="0.8"
    />
    <circle
      cx="44"
      cy="64"
      r="0.8"
      fill={colors.whiteHighlight}
      opacity="0.6"
    />
    <circle
      cx="48"
      cy="64"
      r="0.8"
      fill={colors.whiteHighlight}
      opacity="0.4"
    />
    <circle
      cx="52"
      cy="64"
      r="0.8"
      fill={colors.whiteHighlight}
      opacity="0.6"
    />
    <circle
      cx="56"
      cy="64"
      r="0.8"
      fill={colors.whiteHighlight}
      opacity="0.8"
    />

    {/* CPU/Processing indicators */}
    <g className="robot-thinking-indicators">
      {/* CPU chip representation */}
      <rect
        x="70"
        y="28"
        width="10"
        height="10"
        fill={colors.thinkingBg}
        stroke={colors.thinkingMouth}
        strokeWidth="1"
        className={animated ? "robot-cpu robot-cpu-pulse" : "robot-cpu"}
      />

      {/* CPU grid pattern */}
      <line
        x1="72"
        y1="30"
        x2="78"
        y2="30"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />
      <line
        x1="72"
        y1="32"
        x2="78"
        y2="32"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />
      <line
        x1="72"
        y1="34"
        x2="78"
        y2="34"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />
      <line
        x1="73"
        y1="29"
        x2="73"
        y2="37"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />
      <line
        x1="75"
        y1="29"
        x2="75"
        y2="37"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />
      <line
        x1="77"
        y1="29"
        x2="77"
        y2="37"
        stroke={colors.thinkingMouth}
        strokeWidth="0.5"
      />

      {/* Memory/data flow indicators */}
      <rect
        x="20"
        y="30"
        width="6"
        height="2.5"
        fill={colors.thinkingSecondary || "#f59e0b"}
        className={
          animated ? "robot-memory robot-memory-pulse" : "robot-memory"
        }
      />
      <rect
        x="21"
        y="31"
        width="0.8"
        height="0.8"
        fill={colors.whiteHighlight}
      />
      <rect
        x="22.5"
        y="31"
        width="0.8"
        height="0.8"
        fill={colors.whiteHighlight}
      />
      <rect
        x="24"
        y="31"
        width="0.8"
        height="0.8"
        fill={colors.whiteHighlight}
      />

      {/* Data transfer lines */}
      <line
        x1="27"
        y1="31"
        x2="68"
        y2="33"
        stroke={colors.thinkingTertiary || "#fbbf24"}
        strokeWidth="1"
        strokeDasharray="2,1"
        className={animated ? "robot-data-flow" : ""}
      />
    </g>

    {/* Status indicators */}
    <circle
      cx="22"
      cy="32"
      r="1.5"
      fill={colors.thinkingMouth}
      className={
        animated ? "robot-status-led robot-thinking-pulse" : "robot-status-led"
      }
    />
    <circle
      cx="78"
      cy="32"
      r="1.5"
      fill={colors.thinkingSecondary}
      className={
        animated
          ? "robot-status-led robot-thinking-pulse-delayed"
          : "robot-status-led"
      }
    />

    {/* Chad's hair */}
    {renderChadHair(colors)}

    {/* Chad's white visor - removed */}
    {/* {renderChadVisor(colors)} */}

    {/* Chad's baseball cap - temporarily hidden */}
    {/* {renderChadHat(colors)} */}

    {/* Chad's name label */}
    <text
      x="50"
      y="125"
      textAnchor="middle"
      fill={colors.robotStroke}
      fontSize="12"
      fontWeight="bold"
      fontFamily="Arial, sans-serif"
      className="chad-name-label"
    >
      CHAD
    </text>
  </g>
);

/**
 * Renders a talking Chad expression
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for talking Chad expression
 */
const renderTalkingExpression = (animated, colors) => (
  <g className="chad-face-talking">
    {/* Chad's neck */}
    {renderChadNeck(colors)}

    {/* Chad's polo shirt */}
    {renderChadShirt(colors)}

    {/* Robot head - bigger and rounder, shortened to show more collar */}
    <rect
      x="8"
      y="20"
      width="84"
      height="58"
      rx="28"
      ry="28"
      fill={colors.talkingBg || "#eff6ff"}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line
      x1="16"
      y1="30"
      x2="84"
      y2="30"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />
    <line
      x1="16"
      y1="70"
      x2="84"
      y2="70"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />

    {/* Eyes - active rectangular displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />
      <rect
        x="62"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Active LED indicators with animation */}
      <circle
        cx="29"
        cy="44"
        r="1.2"
        fill={colors.talkingElements}
        className={
          animated ? "robot-eye-led robot-talking-blink" : "robot-eye-led"
        }
      />
      <circle
        cx="35"
        cy="44"
        r="1.2"
        fill={colors.talkingElements}
        className={
          animated
            ? "robot-eye-led robot-talking-blink-delayed"
            : "robot-eye-led"
        }
      />
      <circle
        cx="65"
        cy="44"
        r="1.2"
        fill={colors.talkingElements}
        className={
          animated ? "robot-eye-led robot-talking-blink" : "robot-eye-led"
        }
      />
      <circle
        cx="71"
        cy="44"
        r="1.2"
        fill={colors.talkingElements}
        className={
          animated
            ? "robot-eye-led robot-talking-blink-delayed"
            : "robot-eye-led"
        }
      />

      {/* Eye highlights for alertness */}
      <rect
        x="27"
        y="43"
        width="2"
        height="1"
        fill={colors.whiteHighlight}
        className="robot-eye-highlight"
      />
      <rect
        x="63"
        y="43"
        width="2"
        height="1"
        fill={colors.whiteHighlight}
        className="robot-eye-highlight"
      />
    </g>

    {/* Speaker grille mouth */}
    <rect
      x="32"
      y="56"
      width="36"
      height="10"
      rx="5"
      fill={colors.eyeColor}
      stroke={colors.robotStroke}
      strokeWidth="1"
      className={
        animated
          ? "robot-mouth robot-mouth-talking robot-speaker-animate"
          : "robot-mouth robot-mouth-talking"
      }
    />

    {/* Speaker grille lines */}
    <line
      x1="35"
      y1="58"
      x2="35"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="38"
      y1="58"
      x2="38"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="41"
      y1="58"
      x2="41"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="44"
      y1="58"
      x2="44"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="47"
      y1="58"
      x2="47"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="50"
      y1="58"
      x2="50"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="53"
      y1="58"
      x2="53"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="56"
      y1="58"
      x2="56"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="59"
      y1="58"
      x2="59"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="62"
      y1="58"
      x2="62"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />
    <line
      x1="65"
      y1="58"
      x2="65"
      y2="64"
      stroke={colors.whiteHighlight}
      strokeWidth="1"
    />

    {/* Digital sound waves/transmission indicators */}
    <g className="robot-speech-indicators">
      {/* Digital wave pattern */}
      <rect
        x="14"
        y="46"
        width="1.5"
        height="3"
        fill={colors.talkingElements}
        className={
          animated ? "robot-digital-wave robot-wave-1" : "robot-digital-wave"
        }
      />
      <rect
        x="17"
        y="44"
        width="1.5"
        height="7"
        fill={colors.talkingSecondary || "#60a5fa"}
        className={
          animated ? "robot-digital-wave robot-wave-2" : "robot-digital-wave"
        }
      />
      <rect
        x="20"
        y="42"
        width="1.5"
        height="11"
        fill={colors.talkingTertiary || "#93c5fd"}
        className={
          animated ? "robot-digital-wave robot-wave-3" : "robot-digital-wave"
        }
      />
      <rect
        x="23"
        y="45"
        width="1.5"
        height="5"
        fill={colors.talkingElements}
        className={
          animated ? "robot-digital-wave robot-wave-4" : "robot-digital-wave"
        }
      />

      {/* Transmission indicator */}
      <circle
        cx="82"
        cy="38"
        r="2.5"
        fill="none"
        stroke={colors.talkingElements}
        strokeWidth="1"
        className={
          animated
            ? "robot-transmission robot-transmission-pulse"
            : "robot-transmission"
        }
      />
      <circle cx="82" cy="38" r="0.8" fill={colors.talkingElements} />
    </g>

    {/* Status indicators */}
    <circle
      cx="22"
      cy="32"
      r="1.5"
      fill={colors.talkingElements}
      className={
        animated ? "robot-status-led robot-talking-pulse" : "robot-status-led"
      }
    />
    <circle
      cx="78"
      cy="32"
      r="1.5"
      fill={colors.talkingSecondary}
      className={
        animated
          ? "robot-status-led robot-talking-pulse-delayed"
          : "robot-status-led"
      }
    />

    {/* Chad's hair */}
    {renderChadHair(colors)}

    {/* Chad's white visor - removed */}
    {/* {renderChadVisor(colors)} */}

    {/* Chad's baseball cap - temporarily hidden */}
    {/* {renderChadHat(colors)} */}

    {/* Chad's name label */}
    <text
      x="50"
      y="125"
      textAnchor="middle"
      fill={colors.robotStroke}
      fontSize="12"
      fontWeight="bold"
      fontFamily="Arial, sans-serif"
      className="chad-name-label"
    >
      CHAD
    </text>
  </g>
);

/**
 * Renders a concerned/error Chad expression
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for concerned Chad expression
 */
const renderConcernedExpression = (animated, colors) => (
  <g className="chad-face-concerned">
    {/* Chad's neck */}
    {renderChadNeck(colors)}

    {/* Chad's polo shirt */}
    {renderChadShirt(colors)}

    {/* Robot head - bigger and rounder, shortened to show more collar */}
    <rect
      x="8"
      y="20"
      width="84"
      height="58"
      rx="28"
      ry="28"
      fill={colors.errorBg || "#fef2f2"}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line
      x1="16"
      y1="30"
      x2="84"
      y2="30"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />
    <line
      x1="16"
      y1="70"
      x2="84"
      y2="70"
      stroke={colors.robotStroke}
      strokeWidth="1"
      opacity="0.3"
    />

    {/* Eyes - error state displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />
      <rect
        x="62"
        y="42"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Error X patterns in eyes */}
      <line
        x1="28"
        y1="44"
        x2="36"
        y2="47"
        stroke={colors.errorElements}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="36"
        y1="44"
        x2="28"
        y2="47"
        stroke={colors.errorElements}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="64"
        y1="44"
        x2="72"
        y2="47"
        stroke={colors.errorElements}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="72"
        y1="44"
        x2="64"
        y2="47"
        stroke={colors.errorElements}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </g>

    {/* Error mouth - warning display */}
    <rect
      x="32"
      y="58"
      width="36"
      height="7"
      rx="3"
      fill={colors.errorElements}
      className="robot-mouth robot-mouth-concerned"
    />

    {/* Warning pattern in mouth */}
    <polygon points="42,60 50,64 58,60" fill={colors.whiteHighlight} />
    <rect x="49" y="61" width="2" height="2" fill={colors.errorElements} />

    {/* System error indicators */}
    <g className="robot-error-indicators">
      {/* Main error indicator */}
      <rect
        x="72"
        y="28"
        width="10"
        height="10"
        fill={colors.errorElements}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className={
          animated
            ? "robot-error-symbol robot-error-pulse"
            : "robot-error-symbol"
        }
      />

      {/* Error symbol */}
      <text
        x="77"
        y="35"
        textAnchor="middle"
        fill={colors.whiteHighlight}
        fontSize="6"
        fontWeight="bold"
        className="robot-error-text"
      >
        !
      </text>

      {/* System diagnostic bars */}
      <rect x="20" y="30" width="5" height="1.5" fill={colors.errorElements} />
      <rect
        x="20"
        y="32"
        width="3"
        height="1.5"
        fill={colors.errorElements}
        opacity="0.7"
      />
      <rect x="20" y="34" width="6" height="1.5" fill={colors.errorElements} />
      <rect
        x="20"
        y="36"
        width="2"
        height="1.5"
        fill={colors.errorElements}
        opacity="0.5"
      />
    </g>

    {/* Status indicators - error state */}
    <circle
      cx="22"
      cy="32"
      r="1.5"
      fill={colors.errorElements}
      className={
        animated ? "robot-status-led robot-error-blink" : "robot-status-led"
      }
    />
    <circle
      cx="78"
      cy="32"
      r="1.5"
      fill={colors.errorElements}
      className={
        animated
          ? "robot-status-led robot-error-blink-delayed"
          : "robot-status-led"
      }
    />

    {/* Chad's hair */}
    {renderChadHair(colors)}

    {/* Chad's white visor - removed */}
    {/* {renderChadVisor(colors)} */}

    {/* Chad's baseball cap - temporarily hidden */}
    {/* {renderChadHat(colors)} */}

    {/* Chad's name label */}
    <text
      x="50"
      y="125"
      textAnchor="middle"
      fill={colors.robotStroke}
      fontSize="12"
      fontWeight="bold"
      fontFamily="Arial, sans-serif"
      className="chad-name-label"
    >
      CHAD
    </text>
  </g>
);

// Set PropTypes and default props
ChadFace.propTypes = robotFacePropTypes;
ChadFace.defaultProps = robotFaceDefaultProps;

export default ChadFace;
