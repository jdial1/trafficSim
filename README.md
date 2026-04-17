# Traffic Simulator

A high-performance traffic intersection simulator built with React and HTML5 Canvas.

## Features

- **Real-time Simulation**: Smooth 60fps canvas-based rendering of vehicles and intersections.
- **Custom Traffic Program**: Use a specialized DSL to define traffic phases and movements.
- **Adaptive Control**: System can automatically adjust phase timings based on real-time traffic density.
- **Interactive Monitoring**: Real-time analytics, congestion charts, and phase logs.
- **Responsive Design**: Modern, dark-themed UI built with Tailwind CSS.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd trafficSim
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

### Defining Traffic Phases

You can program the traffic lights using the built-in editor. Each phase defines which movements are allowed to go.

Example:
```
phase(1):
    NORTH_STRAIGHT.GO
    NORTH_LEFT.GO
    SOUTH_STRAIGHT.GO
```

### Control Modes

- **Manual**: Manually adjust the duration of each green light phase.
- **Adaptive**: The system analyzes queue lengths and adjusts timings to minimize congestion.

## Built With

- [React](https://reactjs.org/) - UI Framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Lucide React](https://lucide.dev/) - Icons
- [Recharts](https://recharts.org/) - Analytics Charts
- [Framer Motion](https://www.framer.com/motion/) - UI Animations
