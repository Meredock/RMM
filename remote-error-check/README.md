# Remote Error Check

Monitor remote HTTP endpoints and report errors.

## Setup

```bash
npm install
cp .env.example .env
```

## Configuration

Edit `config/default.json` to define endpoints:

```json
{
  "schedule": "*/5 * * * *",
  "outputFile": "reports/latest.json",
  "endpoints": [
    {
      "url": "https://your-service.com/health",
      "timeout": 5000,
      "expectedStatus": 200
    }
  ]
}
```

- **schedule** — cron expression for recurring checks (omit to run once)
- **outputFile** — path to write JSON report (omit to skip file output)
- **endpoints[].timeout** — request timeout in ms (default: 5000)
- **endpoints[].expectedStatus** — expected HTTP status code (default: any < 400)

## Usage

```bash
# Run once
npm start

# Run in watch mode (restarts on file change)
npm run dev
```

## Tests

```bash
npm test
```

## Output

Results are printed to the console and (optionally) written to `reports/latest.json`. Logs are saved to `logs/`.
