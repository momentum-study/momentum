import React from 'react'

export interface WidgetDefinition {
  id: string
  label: string
  defaultSize?: 'small' | 'medium' | 'large'
  component: React.LazyExoticComponent<React.ComponentType> | React.ComponentType
}

const widgetRegistry = new Map<string, WidgetDefinition>()

export function registerWidget(def: WidgetDefinition) {
  widgetRegistry.set(def.id, def)
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return widgetRegistry.get(id)
}

export function listWidgets(): WidgetDefinition[] {
  return Array.from(widgetRegistry.values())
}

declare global {
  interface Window {
    Momentum?: {
      registerWidget: typeof registerWidget
    }
  }
}

if (typeof window !== 'undefined') {
  window.Momentum = window.Momentum ?? { registerWidget }
}
