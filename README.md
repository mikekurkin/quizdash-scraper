# Quiz Scraper

A TypeScript application for scraping quiz game results from QuizPlease website.

## Features

- Scrapes game data and results from multiple cities
- Stores data in CSV format
- Timezone-aware date handling
- Configurable via environment variables
- Scheduled execution using cron

## Notes

- Team names are normalized to handle slight variations in spelling
- Achievement ranks are matched using image URLs

## Installation

```bash
# Clone the repository
git clone https://github.com/mikekurkin/quizdash-scraper.git

# Install dependencies
cd quiz-scraper
npm install

# Copy example configuration files for cities and ranks
cp data/cities.csv.example data/cities.csv
cp data/ranks.csv.example data/ranks.csv
```

## Configuration

Create a `.env` file in the root directory:

```env
# Cron schedule (default: "2 3 * * *" - 3:02 AM daily)
CRON_SCHEDULE=2 3 * * *

# Comma-separated list of city IDs to scrape (default: 17 - Saint Petersburg)
CITY_IDS=17,9,18

# Log level: ERROR, WARN, INFO, DEBUG (default: INFO)
LOG_LEVEL=INFO

# API base URL (default: https://quizplease.ru)
API_BASE_URL=https://quizplease.ru
```

## Usage

```bash
# Start the scraper
npm start
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
