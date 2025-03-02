import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [
    presetUno()
  ],
  // 添加你的项目中使用到的所有 class
  safelist: [
    // layout
    'min-h-screen', 'flex', 'flex-col', 'items-center', 'py-8', 'pt-20',
    // spacing
    'w-full', 'max-w-4xl', 'max-w-3xl', 'max-w-2xl', 'px-4', 'gap-2', 'gap-4', 'gap-8',
    'mb-8', 'mb-6', 'mb-4', 'mb-3', 'mb-2', 'mb-1', 'mt-2', 'mt-3',
    'px-6', 'py-3', 'px-1', 'pb-2', 'p-6',
    // typography
    'text-4xl', 'text-xl', 'text-lg', 'text-sm',
    'font-bold', 'font-medium', 'font-semibold',
    'text-center',
    'text-gray-800', 'text-gray-700', 'text-gray-600', 'text-gray-500',
    'text-blue-600', 'text-blue-500', 'text-orange-500',
    // borders
    'rounded-lg', 'border-b', 'border-gray-200',
    // backgrounds
    'bg-white', 'bg-gray-100',
    // flexbox
    'items-start', 'flex-1', 'flex-shrink-0',
    // dimensions
    'w-20', 'h-28',
    // utilities
    'space-y-4', 'line-clamp-2',
    // transitions
    'transition-all', 'duration-200',
    // hover states
    'hover:text-blue-600',
    // other
    'inline-flex', 'items-center'
  ],
  // 可以添加自定义规则
  rules: [
    // ...
  ],
  // 可以添加快捷方式
  shortcuts: {
    // ...
  }
}); 