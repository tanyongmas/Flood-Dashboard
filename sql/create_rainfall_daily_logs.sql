-- ตารางจัดเก็บปริมาณน้ำฝนรายวันของสถานีอ้างอิงในพื้นที่ (ThaiWater API v3)
-- สำหรับคำนวณยอดฝนสะสม 3 วัน, 7 วัน และรายเดือนของแต่ละสถานีอย่างแม่นยำ

CREATE TABLE IF NOT EXISTS public.rainfall_daily_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id TEXT NOT NULL,
  station_code TEXT NOT NULL,
  station_name TEXT,
  record_date DATE NOT NULL,
  rain_mm NUMERIC(8, 2) NOT NULL DEFAULT 0,
  measured_at TIMESTAMPTZ,
  source TEXT DEFAULT 'thaiwater_v3',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rainfall_daily_logs_station_date_key UNIQUE (station_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_rainfall_daily_logs_station_date
  ON public.rainfall_daily_logs (station_id, record_date DESC);

ALTER TABLE public.rainfall_daily_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rainfall_daily_logs' AND policyname = 'Allow public read rainfall_daily_logs'
  ) THEN
    CREATE POLICY "Allow public read rainfall_daily_logs"
      ON public.rainfall_daily_logs
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rainfall_daily_logs' AND policyname = 'Allow public insert rainfall_daily_logs'
  ) THEN
    CREATE POLICY "Allow public insert rainfall_daily_logs"
      ON public.rainfall_daily_logs
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rainfall_daily_logs' AND policyname = 'Allow public update rainfall_daily_logs'
  ) THEN
    CREATE POLICY "Allow public update rainfall_daily_logs"
      ON public.rainfall_daily_logs
      FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
