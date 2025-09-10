/**
 * @fileoverview RobotFace component that renders SVG-based facial expressions
 */

import { useTheme } from "../ThemeProvider.jsx";
import { getThemeColor } from "../../utils/themeUtils.js";
import { robotFacePropTypes, robotFaceDefaultProps } from "./propTypes.js";
import { getAccessibleColors } from "./accessibility.js";
import "./RobotFaceAnimations.css";

/**
 * RobotFace component that renders different facial expressions using SVG
 * @param {Object} props - Component props
 * @param {string} props.expression - The facial expression to render ('happy', 'thinking', 'talking', 'concerned')
 * @param {boolean} [props.animated=true] - Whether to enable animations
 * @param {string} [props.size='md'] - Size variant for scaling
 * @param {Object} [props.theme] - Theme object for color customization
 * @returns {JSX.Element} The RobotFace SVG component
 */
const RobotFace = ({ expression, animated = true, size = 'md', theme: propTheme }) => {
  const contextTheme = useTheme();
  const theme = propTheme || contextTheme;
  // Size configurations for SVG scaling
  const sizeMap = {
    sm: { width: 40, height: 40, scale: 0.8 },
    md: { width: 56, height: 56, scale: 1.0 },
    lg: { width: 80, height: 80, scale: 1.2 }
  };

  const { width, height, scale } = sizeMap[size] || sizeMap.md;

  // Get theme colors with fallbacks ensuring proper contrast ratios
  const baseColors = {
    robotBody: getThemeColor('primary', 50, theme) || '#f8fafc',
    robotStroke: getThemeColor('gray', 600, theme) || '#475569', // Darker for better contrast
    happyMouth: getThemeColor('primary', 700, theme) || '#047857', // Darker for better contrast
    thinkingMouth: getThemeColor('secondary', 700, theme) || '#b45309', // Darker for better contrast
    thinkingBg: getThemeColor('secondary', 50, theme) || '#fefce8',
    thinkingSecondary: getThemeColor('secondary', 500, theme) || '#d97706', // Adjusted for contrast
    thinkingTertiary: getThemeColor('secondary', 400, theme) || '#f59e0b',
    talkingElements: getThemeColor('primary', 600, theme) || '#2563eb', // Darker for better contrast
    talkingBg: getThemeColor('primary', 50, theme) || '#eff6ff',
    talkingSecondary: getThemeColor('primary', 500, theme) || '#3b82f6',
    talkingTertiary: getThemeColor('primary', 400, theme) || '#60a5fa',
    errorElements: getThemeColor('tertiary', 700, theme) || '#b91c1c', // Darker for better contrast
    errorBg: getThemeColor('tertiary', 50, theme) || '#fef2f2',
    eyeColor: '#0f172a', // Darker for better contrast
    whiteHighlight: '#ffffff'
  };

  // Apply accessibility adjustments for high contrast and forced colors
  const colors = getAccessibleColors(baseColors);

  // Common SVG props with accessibility attributes
  const svgProps = {
    width,
    height,
    viewBox: "0 0 100 100",
    className: `robot-face-svg robot-expression-${expression} ${animated ? 'robot-animated' : 'robot-static'}`,
    "data-testid": "robot-face-svg",
    role: "presentation",
    "aria-hidden": "true",
    focusable: "false"
  };

  // Render different expressions based on the expression prop
  const renderExpression = () => {
    switch (expression) {
      case 'happy':
        return renderHappyExpression(scale, animated, colors);
      case 'thinking':
        return renderThinkingExpression(scale, animated, colors);
      case 'talking':
        return renderTalkingExpression(scale, animated, colors);
      case 'concerned':
        return renderConcernedExpression(scale, animated, colors);
      default:
        return renderHappyExpression(scale, animated, colors);
    }
  };

  return (
    <svg {...svgProps}>
      {renderExpression()}
    </svg>
  );
};

/**
 * Renders a happy facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for happy expression
 */
const renderHappyExpression = (scale, animated, colors) => (
  <g className="robot-face-happy">
    {/* Robot head - rounded rectangle for more robotic look */}
    <rect
      x="10"
      y="10"
      width="80"
      height="80"
      rx="12"
      ry="12"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line x1="18" y1="18" x2="82" y2="18" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />
    <line x1="18" y1="82" x2="82" y2="82" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />

    {/* Eyes - rectangular LED-style displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="32"
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
        y="32"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />

      {/* LED indicators inside eyes */}
      <circle cx="29" cy="34" r="1.2" fill={colors.happyMouth} className="robot-eye-led" />
      <circle cx="35" cy="34" r="1.2" fill={colors.happyMouth} className="robot-eye-led" />
      <circle cx="65" cy="34" r="1.2" fill={colors.happyMouth} className="robot-eye-led" />
      <circle cx="71" cy="34" r="1.2" fill={colors.happyMouth} className="robot-eye-led" />
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
    <rect x="34" y="60" width="4" height="2" fill={colors.whiteHighlight} opacity="0.8" />
    <rect x="40" y="60" width="4" height="2" fill={colors.whiteHighlight} opacity="0.6" />
    <rect x="46" y="60" width="4" height="2" fill={colors.whiteHighlight} opacity="0.8" />
    <rect x="52" y="60" width="4" height="2" fill={colors.whiteHighlight} opacity="0.6" />
    <rect x="58" y="60" width="4" height="2" fill={colors.whiteHighlight} opacity="0.8" />
    <rect x="64" y="60" width="2" height="2" fill={colors.whiteHighlight} opacity="0.4" />

    {/* Status indicators */}
    <circle cx="22" cy="22" r="1.5" fill={colors.happyMouth} className="robot-status-led" />
    <circle cx="78" cy="22" r="1.5" fill={colors.happyMouth} className="robot-status-led" />

    {/* Antenna/sensor elements */}
    <rect x="48" y="6" width="4" height="6" fill={colors.robotStroke} />
    <circle cx="50" cy="4" r="1.5" fill={colors.happyMouth} />
  </g>
);

/**
 * Renders a thinking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for thinking expression
 */
const renderThinkingExpression = (scale, animated, colors) => (
  <g className="robot-face-thinking">
    {/* Robot head - rounded rectangle for more robotic look */}
    <rect
      x="10"
      y="10"
      width="80"
      height="80"
      rx="12"
      ry="12"
      fill={colors.thinkingBg || '#fefce8'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line x1="18" y1="18" x2="82" y2="18" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />
    <line x1="18" y1="82" x2="82" y2="82" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />

    {/* Eyes - narrowed rectangular displays for concentration */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="34"
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
        y="34"
        width="12"
        height="4"
        rx="1"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Scanning LED indicators */}
      <rect x="27" y="35" width="1.5" height="2" fill={colors.thinkingMouth} className="robot-eye-led" />
      <rect x="30" y="35" width="1.5" height="2" fill={colors.thinkingMouth} opacity="0.6" />
      <rect x="33" y="35" width="1.5" height="2" fill={colors.thinkingMouth} opacity="0.3" />
      <rect x="63" y="35" width="1.5" height="2" fill={colors.thinkingMouth} className="robot-eye-led" />
      <rect x="66" y="35" width="1.5" height="2" fill={colors.thinkingMouth} opacity="0.6" />
      <rect x="69" y="35" width="1.5" height="2" fill={colors.thinkingMouth} opacity="0.3" />
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
    <circle cx="40" cy="64" r="0.8" fill={colors.whiteHighlight} opacity="0.8" />
    <circle cx="44" cy="64" r="0.8" fill={colors.whiteHighlight} opacity="0.6" />
    <circle cx="48" cy="64" r="0.8" fill={colors.whiteHighlight} opacity="0.4" />
    <circle cx="52" cy="64" r="0.8" fill={colors.whiteHighlight} opacity="0.6" />
    <circle cx="56" cy="64" r="0.8" fill={colors.whiteHighlight} opacity="0.8" />

    {/* CPU/Processing indicators */}
    <g className="robot-thinking-indicators">
      {/* CPU chip representation */}
      <rect
        x="70"
        y="18"
        width="10"
        height="10"
        fill={colors.thinkingBg}
        stroke={colors.thinkingMouth}
        strokeWidth="1"
        className={animated ? "robot-cpu robot-cpu-pulse" : "robot-cpu"}
      />

      {/* CPU grid pattern */}
      <line x1="72" y1="20" x2="78" y2="20" stroke={colors.thinkingMouth} strokeWidth="0.5" />
      <line x1="72" y1="22" x2="78" y2="22" stroke={colors.thinkingMouth} strokeWidth="0.5" />
      <line x1="72" y1="24" x2="78" y2="24" stroke={colors.thinkingMouth} strokeWidth="0.5" />
      <line x1="73" y1="19" x2="73" y2="27" stroke={colors.thinkingMouth} strokeWidth="0.5" />
      <line x1="75" y1="19" x2="75" y2="27" stroke={colors.thinkingMouth} strokeWidth="0.5" />
      <line x1="77" y1="19" x2="77" y2="27" stroke={colors.thinkingMouth} strokeWidth="0.5" />

      {/* Memory/data flow indicators */}
      <rect
        x="20"
        y="20"
        width="6"
        height="2.5"
        fill={colors.thinkingSecondary || '#f59e0b'}
        className={animated ? "robot-memory robot-memory-pulse" : "robot-memory"}
      />
      <rect x="21" y="21" width="0.8" height="0.8" fill={colors.whiteHighlight} />
      <rect x="22.5" y="21" width="0.8" height="0.8" fill={colors.whiteHighlight} />
      <rect x="24" y="21" width="0.8" height="0.8" fill={colors.whiteHighlight} />

      {/* Data transfer lines */}
      <line x1="27" y1="21" x2="68" y2="23" stroke={colors.thinkingTertiary || '#fbbf24'} strokeWidth="1" strokeDasharray="2,1" className={animated ? "robot-data-flow" : ""} />
    </g>

    {/* Status indicators */}
    <circle cx="22" cy="22" r="1.5" fill={colors.thinkingMouth} className={animated ? "robot-status-led robot-thinking-pulse" : "robot-status-led"} />
    <circle cx="78" cy="22" r="1.5" fill={colors.thinkingSecondary} className={animated ? "robot-status-led robot-thinking-pulse-delayed" : "robot-status-led"} />

    {/* Antenna/sensor elements */}
    <rect x="48" y="6" width="4" height="6" fill={colors.robotStroke} />
    <rect x="49" y="4" width="2" height="2" fill={colors.thinkingMouth} className={animated ? "robot-antenna-pulse" : ""} />
  </g>
);

/**
 * Renders a talking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for talking expression
 */
const renderTalkingExpression = (scale, animated, colors) => (
  <g className="robot-face-talking">
    {/* Robot head - rounded rectangle for more robotic look */}
    <rect
      x="10"
      y="10"
      width="80"
      height="80"
      rx="12"
      ry="12"
      fill={colors.talkingBg || '#eff6ff'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line x1="18" y1="18" x2="82" y2="18" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />
    <line x1="18" y1="82" x2="82" y2="82" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />

    {/* Eyes - active rectangular displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="32"
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
        y="32"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Active LED indicators with animation */}
      <circle cx="29" cy="34" r="1.2" fill={colors.talkingElements} className={animated ? "robot-eye-led robot-talking-blink" : "robot-eye-led"} />
      <circle cx="35" cy="34" r="1.2" fill={colors.talkingElements} className={animated ? "robot-eye-led robot-talking-blink-delayed" : "robot-eye-led"} />
      <circle cx="65" cy="34" r="1.2" fill={colors.talkingElements} className={animated ? "robot-eye-led robot-talking-blink" : "robot-eye-led"} />
      <circle cx="71" cy="34" r="1.2" fill={colors.talkingElements} className={animated ? "robot-eye-led robot-talking-blink-delayed" : "robot-eye-led"} />

      {/* Eye highlights for alertness */}
      <rect x="27" y="33" width="2" height="1" fill={colors.whiteHighlight} className="robot-eye-highlight" />
      <rect x="63" y="33" width="2" height="1" fill={colors.whiteHighlight} className="robot-eye-highlight" />
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
      className={animated ? "robot-mouth robot-mouth-talking robot-speaker-animate" : "robot-mouth robot-mouth-talking"}
    />

    {/* Speaker grille lines */}
    <line x1="35" y1="58" x2="35" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="38" y1="58" x2="38" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="41" y1="58" x2="41" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="44" y1="58" x2="44" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="47" y1="58" x2="47" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="50" y1="58" x2="50" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="53" y1="58" x2="53" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="56" y1="58" x2="56" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="59" y1="58" x2="59" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="62" y1="58" x2="62" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />
    <line x1="65" y1="58" x2="65" y2="64" stroke={colors.whiteHighlight} strokeWidth="1" />

    {/* Digital sound waves/transmission indicators */}
    <g className="robot-speech-indicators">
      {/* Digital wave pattern */}
      <rect
        x="14"
        y="46"
        width="1.5"
        height="3"
        fill={colors.talkingElements}
        className={animated ? "robot-digital-wave robot-wave-1" : "robot-digital-wave"}
      />
      <rect
        x="17"
        y="44"
        width="1.5"
        height="7"
        fill={colors.talkingSecondary || '#60a5fa'}
        className={animated ? "robot-digital-wave robot-wave-2" : "robot-digital-wave"}
      />
      <rect
        x="20"
        y="42"
        width="1.5"
        height="11"
        fill={colors.talkingTertiary || '#93c5fd'}
        className={animated ? "robot-digital-wave robot-wave-3" : "robot-digital-wave"}
      />
      <rect
        x="23"
        y="45"
        width="1.5"
        height="5"
        fill={colors.talkingElements}
        className={animated ? "robot-digital-wave robot-wave-4" : "robot-digital-wave"}
      />

      {/* Transmission indicator */}
      <circle
        cx="82"
        cy="28"
        r="2.5"
        fill="none"
        stroke={colors.talkingElements}
        strokeWidth="1"
        className={animated ? "robot-transmission robot-transmission-pulse" : "robot-transmission"}
      />
      <circle cx="82" cy="28" r="0.8" fill={colors.talkingElements} />
    </g>

    {/* Status indicators */}
    <circle cx="22" cy="22" r="1.5" fill={colors.talkingElements} className={animated ? "robot-status-led robot-talking-pulse" : "robot-status-led"} />
    <circle cx="78" cy="22" r="1.5" fill={colors.talkingSecondary} className={animated ? "robot-status-led robot-talking-pulse-delayed" : "robot-status-led"} />

    {/* Antenna/sensor elements */}
    <rect x="48" y="6" width="4" height="6" fill={colors.robotStroke} />
    <circle cx="50" cy="4" r="1.5" fill={colors.talkingElements} className={animated ? "robot-antenna-active" : ""} />
  </g>
);

/**
 * Renders a concerned/error facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for concerned expression
 */
const renderConcernedExpression = (scale, animated, colors) => (
  <g className="robot-face-concerned">
    {/* Robot head - rounded rectangle for more robotic look */}
    <rect
      x="10"
      y="10"
      width="80"
      height="80"
      rx="12"
      ry="12"
      fill={colors.errorBg || '#fef2f2'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Head panel lines for tech aesthetic */}
    <line x1="18" y1="18" x2="82" y2="18" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />
    <line x1="18" y1="82" x2="82" y2="82" stroke={colors.robotStroke} strokeWidth="1" opacity="0.3" />

    {/* Eyes - error state displays */}
    <g className="robot-eyes">
      <rect
        x="26"
        y="32"
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
        y="32"
        width="12"
        height="7"
        rx="2"
        fill={colors.eyeColor}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className="robot-eye"
      />

      {/* Error X patterns in eyes */}
      <line x1="28" y1="34" x2="36" y2="37" stroke={colors.errorElements} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="36" y1="34" x2="28" y2="37" stroke={colors.errorElements} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="64" y1="34" x2="72" y2="37" stroke={colors.errorElements} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="72" y1="34" x2="64" y2="37" stroke={colors.errorElements} strokeWidth="1.5" strokeLinecap="round" />
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
    <polygon
      points="42,60 50,64 58,60"
      fill={colors.whiteHighlight}
    />
    <rect x="49" y="61" width="2" height="2" fill={colors.errorElements} />

    {/* System error indicators */}
    <g className="robot-error-indicators">
      {/* Main error indicator */}
      <rect
        x="72"
        y="18"
        width="10"
        height="10"
        fill={colors.errorElements}
        stroke={colors.robotStroke}
        strokeWidth="1"
        className={animated ? "robot-error-symbol robot-error-pulse" : "robot-error-symbol"}
      />

      {/* Error symbol */}
      <text
        x="77"
        y="25"
        textAnchor="middle"
        fill={colors.whiteHighlight}
        fontSize="6"
        fontWeight="bold"
        className="robot-error-text"
      >
        !
      </text>

      {/* System diagnostic bars */}
      <rect x="20" y="20" width="5" height="1.5" fill={colors.errorElements} />
      <rect x="20" y="22" width="3" height="1.5" fill={colors.errorElements} opacity="0.7" />
      <rect x="20" y="24" width="6" height="1.5" fill={colors.errorElements} />
      <rect x="20" y="26" width="2" height="1.5" fill={colors.errorElements} opacity="0.5" />
    </g>

    {/* Status indicators - error state */}
    <circle cx="22" cy="22" r="1.5" fill={colors.errorElements} className={animated ? "robot-status-led robot-error-blink" : "robot-status-led"} />
    <circle cx="78" cy="22" r="1.5" fill={colors.errorElements} className={animated ? "robot-status-led robot-error-blink-delayed" : "robot-status-led"} />

    {/* Antenna/sensor elements - error state */}
    <rect x="48" y="6" width="4" height="6" fill={colors.robotStroke} />
    <rect x="49" y="4" width="2" height="2" fill={colors.errorElements} className={animated ? "robot-antenna-error" : ""} />
  </g>
);

// Set PropTypes and default props
RobotFace.propTypes = robotFacePropTypes;
RobotFace.defaultProps = robotFaceDefaultProps;

export default RobotFace;