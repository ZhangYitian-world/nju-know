import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Coffee,
  FlaskConical,
  Globe,
  Lightbulb,
  Megaphone,
  MessagesSquare,
  Palette,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "./classify";

// 每个分类的图标和无封面时的占位渐变色
export const CATEGORY_STYLE: Record<Category, { icon: LucideIcon; from: string; to: string }> = {
  文体: { icon: Palette, from: "#f472b6", to: "#fb923c" },
  社团: { icon: Users, from: "#34d399", to: "#0ea5e9" },
  讲座: { icon: MessagesSquare, from: "#818cf8", to: "#6a1b80" },
  学习: { icon: Lightbulb, from: "#facc15", to: "#f97316" },
  就业: { icon: Briefcase, from: "#38bdf8", to: "#1d4ed8" },
  留学: { icon: Globe, from: "#2dd4bf", to: "#0f766e" },
  校园: { icon: Megaphone, from: "#a78bfa", to: "#6a1b80" },
  科研: { icon: FlaskConical, from: "#60a5fa", to: "#4338ca" },
  院系: { icon: Building2, from: "#c084fc", to: "#7e22ce" },
  生活: { icon: Coffee, from: "#fdba74", to: "#e11d48" },
  学业: { icon: BookOpen, from: "#86efac", to: "#15803d" },
  奖学金: { icon: Award, from: "#fcd34d", to: "#b45309" },
  服务: { icon: Wrench, from: "#94a3b8", to: "#334155" },
};
