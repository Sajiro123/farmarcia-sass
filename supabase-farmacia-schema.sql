-- =========================================================================
-- MEDICARE SAAS: ESQUEMA DE BASE DE DATOS FARMACÉUTICA EN SUPABASE
-- Conexión Directa desde Frontend Angular (Sin Backend Java)
-- =========================================================================

-- 1. TABLA DE LABORATORIOS FARMACÉUTICOS
CREATE TABLE IF NOT EXISTS public.laboratorios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(200) NOT NULL UNIQUE,
    pais VARCHAR(100) DEFAULT 'Perú',
    esta_activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE PRINCIPIOS ACTIVOS (DCI)
CREATE TABLE IF NOT EXISTS public.principios_activos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(200) NOT NULL UNIQUE,
    descripcion TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE PRODUCTOS Y MEDICAMENTOS (DIGEMID)
CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_barras VARCHAR(50) UNIQUE,
    codigo_interno VARCHAR(50) NOT NULL UNIQUE,
    nombre_comercial VARCHAR(255) NOT NULL,
    nombre_generico VARCHAR(255),
    principio_activo_id UUID REFERENCES public.principios_activos(id) ON DELETE SET NULL,
    laboratorio_id UUID REFERENCES public.laboratorios(id) ON DELETE SET NULL,
    concentracion VARCHAR(100),
    registro_sanitario VARCHAR(100),
    tipo_receta VARCHAR(30) DEFAULT 'VENTA_LIBRE', -- VENTA_LIBRE, RECETA_MEDICA, RECETA_RETENIDA
    es_fraccionable BOOLEAN DEFAULT TRUE,
    unidades_por_caja INT DEFAULT 1,
    precio_costo NUMERIC(12, 4) DEFAULT 0.0000,
    precio_venta NUMERIC(12, 2) NOT NULL,
    precio_venta_fraccion NUMERIC(12, 2),
    tipo_afectacion_igv VARCHAR(10) DEFAULT '10', -- Gravado 10, Exonerado 20, Inafecto 30
    stock_minimo INT DEFAULT 5,
    stock_maximo INT DEFAULT 100,
    esta_activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA DE LOTES DE PRODUCTO (TRAZABILIDAD DIGEMID)
CREATE TABLE IF NOT EXISTS public.lotes_producto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    numero_lote VARCHAR(100) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    fecha_fabricacion DATE,
    registro_sanitario VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'ACTIVO', -- ACTIVO, BLOQUEADO, VENCIDO, AGOTADO
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA DE STOCK E INVENTARIO (MOTOR FEFO)
CREATE TABLE IF NOT EXISTS public.stock_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    almacen_id UUID DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    lote_id UUID NOT NULL REFERENCES public.lotes_producto(id) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0,
    cantidad_fraccion INT DEFAULT 0,
    ubicacion VARCHAR(50) DEFAULT 'P1-E1-N1',
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA DE SEDES / SUCURSALES
CREATE TABLE IF NOT EXISTS public.sedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    activa BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA DE VENTAS / TICKETS EMITIDOS (POS)
CREATE TABLE IF NOT EXISTS public.ventas (
    id VARCHAR(50) PRIMARY KEY, -- Ej: B001-123456
    cliente_nombre VARCHAR(150) DEFAULT 'CLIENTE VARIOS',
    cliente_documento VARCHAR(20) DEFAULT '00000000',
    tipo_comprobante VARCHAR(20) NOT NULL, -- Boleta, Factura, Ticket
    subtotal NUMERIC(12, 2) NOT NULL,
    igv NUMERIC(12, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL,
    modo_pago VARCHAR(50) DEFAULT 'simple',
    metodo_pago VARCHAR(50) DEFAULT 'Efectivo',
    desglose_pagos JSONB,
    datos_receta JSONB,
    sede_nombre VARCHAR(100) DEFAULT 'Sede Principal',
    estado VARCHAR(20) DEFAULT 'EMITIDO', -- EMITIDO, ANULADO
    anulado_por VARCHAR(100),
    motivo_anulacion TEXT,
    anulado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA DE DETALLES DE VENTA
CREATE TABLE IF NOT EXISTS public.venta_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id VARCHAR(50) NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    producto_nombre VARCHAR(255) NOT NULL,
    lote_codigo VARCHAR(100),
    cantidad INT NOT NULL,
    tipo_presentacion VARCHAR(20) DEFAULT 'Unidad', -- Caja, Blister, Unidad
    precio_unitario NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL
);

-- 9. TABLA DE ACTAS DE BAJA DE MEDICAMENTOS (DIGEMID / MERMAS)
CREATE TABLE IF NOT EXISTS public.actas_baja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha TIMESTAMPTZ DEFAULT NOW(),
    responsable VARCHAR(150) NOT NULL,
    cmp_quimico VARCHAR(50),
    motivo VARCHAR(100) NOT NULL,
    observaciones TEXT,
    lote_id VARCHAR(100),
    cantidad_baja INT NOT NULL,
    costo_perdida NUMERIC(12, 2) DEFAULT 0.00
);

-- =========================================================================
-- HABILITACIÓN DE ROW LEVEL SECURITY (RLS) PARA ACCESO PÚBLICO / ANON
-- =========================================================================
ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.principios_activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actas_baja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.laboratorios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.principios_activos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.lotes_producto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.stock_inventario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.sedes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.ventas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.venta_detalles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Lectura y escritura abierta para anon/autenticados" ON public.actas_baja FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- DATOS SEMILLA INICIALES (DEMO COMPLETA)
-- =========================================================================
INSERT INTO public.sedes (nombre, direccion, telefono) VALUES
('Sede Principal (Av. Central 123)', 'Av. Central 123, Lima', '01-456-7890'),
('Sucursal Norte (Av. Los Olivos 456)', 'Av. Los Olivos 456, Lima', '01-987-6543')
ON CONFLICT DO NOTHING;

INSERT INTO public.laboratorios (nombre, pais) VALUES
('GSK / GlaxoSmithKline', 'Reino Unido'),
('Pfizer', 'Estados Unidos'),
('Genfar', 'Colombia'),
('Bayer', 'Alemania'),
('Laboratorios Portugal', 'Perú')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.principios_activos (nombre, descripcion) VALUES
('Paracetamol', 'Analgésico y antipirético.'),
('Amoxicilina', 'Antibiótico betalactámico de amplio espectro.'),
('Ibuprofeno', 'Antiinflamatorio no esteroideo (AINE).'),
('Clonazepam', 'Benzodiacepina de acción prolongada. Venta bajo receta retenida.'),
('Ácido Acetilsalicílico', 'Antiagregante plaquetario y analgésico.')
ON CONFLICT (nombre) DO NOTHING;
