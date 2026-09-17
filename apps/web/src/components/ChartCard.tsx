'use client'

import { useRef, useEffect, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  LineController,
  BarController,
  DoughnutController,
  ScatterController,
  type ChartConfiguration,
  type ChartData,
} from 'chart.js'
import type { ChartConfig } from '@olist/contracts'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  LineController,
  BarController,
  DoughnutController,
  ScatterController
)

interface ChartCardProps {
  config: ChartConfig
  className?: string
}

function buildChartData(config: ChartConfig): ChartData {
  return {
    labels: config.data.labels,
    datasets: config.data.datasets.map((ds) => ({
      ...ds,
      data: ds.data as number[] | { x: number | null; y: number | null; key: string }[],
      backgroundColor: ds.backgroundColor,
      borderColor: ds.borderColor,
      fill: ds.fill,
      tension: ds.tension,
      yAxisID: ds.yAxisID,
      stack: ds.stack,
    })),
  }
}

function buildChartConfig(config: ChartConfig): Partial<ChartConfiguration> {
  const isHorizontal = config.options?.indexAxis === 'y'

  return {
    type: config.type,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis: config.options?.indexAxis as 'x' | 'y' | undefined,
      plugins: {
        legend: {
          display: config.data.datasets.length > 1,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 12, family: 'system-ui' },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleFont: { size: 12, family: 'system-ui' },
          bodyFont: { size: 12, family: 'system-ui' },
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || ''
              const value = ctx.parsed.y ?? ctx.parsed.x
              if (typeof value === 'number') {
                return `${label}: ${value.toLocaleString()}`
              }
              return label
            },
          },
        },
      },
      scales: config.options?.scales
        ? Object.fromEntries(
            Object.entries(config.options.scales).map(([key, scale]) => [
              key,
              {
                ...scale,
                title: scale.title ? { display: true, text: scale.title.text } : undefined,
                grid: { color: '#E2E8F0' },
                ticks: {
                  font: { size: 11, family: 'system-ui' },
                  ...(isHorizontal
                    ? {
                        autoSkip: false,
                      }
                    : {
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 8,
                      }),
                },
              },
            ])
          )
        : undefined,
    },
  }
}

export function ChartCard({ config, className }: ChartCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartJS | null>(null)

  const chartData = useMemo(() => buildChartData(config), [config])
  const chartConfig = useMemo(() => buildChartConfig(config), [config])

  useEffect(() => {
    if (!canvasRef.current) return

    if (chartRef.current) {
      chartRef.current.destroy()
    }

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    chartRef.current = new ChartJS(ctx, {
      type: config.type,
      data: chartData as ChartData,
      options: chartConfig.options as ChartConfiguration['options'],
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [config, chartData, chartConfig])

  return (
    <div className={className}>
      <canvas ref={canvasRef} aria-label={config.title} role="img" />
    </div>
  )
}
