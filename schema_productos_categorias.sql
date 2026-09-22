-- =========================================================================
-- ESTRUCTURA DE CATÁLOGO Y PRODUCTOS EN ESPAÑOL (PostgreSQL)
-- Modelo de Herencia por Tabla de Especialización (Class Table Inheritance)
-- =========================================================================

-- 1. Tabla de Categorías (Ej. Analgésicos, Cuidado Personal, Fragancias)
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    esta_activo BOOLEAN DEFAULT TRUE
);

-- 2. Tabla central de Productos (Datos compartidos y generales)
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    tipo_producto VARCHAR(20) NOT NULL CHECK (tipo_producto IN ('MEDICAMENTO', 'PERFUME')),
    nombre VARCHAR(200) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    descripcion TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla hija: Detalles específicos de Medicamentos
CREATE TABLE IF NOT EXISTS detalles_medicamentos (
    producto_id INTEGER PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
    laboratorio VARCHAR(100) NOT NULL,
    principio_activo VARCHAR(200) NOT NULL,
    requiere_receta BOOLEAN DEFAULT FALSE,
    fecha_vencimiento DATE,
    numero_lote VARCHAR(50)
);

-- 4. Tabla hija: Detalles específicos de Perfumes
CREATE TABLE IF NOT EXISTS detalles_perfumes (
    producto_id INTEGER PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
    marca VARCHAR(100) NOT NULL,
    familia_olfativa VARCHAR(100), -- Ej. Floral, Amaderado, Cítrico, Oriental
    volumen_ml INTEGER NOT NULL,
    genero_objetivo VARCHAR(20) CHECK (genero_objetivo IN ('HOMBRE', 'MUJER', 'UNISEX'))
);

-- =========================================================================
-- ÍNDICES DE RENDIMIENTO (Optimización de Búsqueda y Claves Foráneas)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_productos_categoria_id ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_tipo_producto ON productos(tipo_producto);
CREATE INDEX IF NOT EXISTS idx_productos_sku ON productos(sku);
CREATE INDEX IF NOT EXISTS idx_detalles_medicamentos_principio_activo ON detalles_medicamentos(principio_activo);
CREATE INDEX IF NOT EXISTS idx_detalles_medicamentos_laboratorio ON detalles_medicamentos(laboratorio);
CREATE INDEX IF NOT EXISTS idx_detalles_perfumes_marca ON detalles_perfumes(marca);
CREATE INDEX IF NOT EXISTS idx_detalles_perfumes_familia ON detalles_perfumes(familia_olfativa);

-- =========================================================================
-- TRIGGER PARA ACTUALIZAR 'actualizado_en' AUTOMÁTICAMENTE
-- =========================================================================
CREATE OR REPLACE FUNCTION actualizar_timestamp_productos()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_actualizado_en ON productos;
CREATE TRIGGER trg_productos_actualizado_en
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION actualizar_timestamp_productos();

-- =========================================================================
-- VISTAS ÚTILES PARA CONSULTAS UNIFICADAS (POS Y CATÁLOGO)
-- =========================================================================

-- Vista Completa de Medicamentos
CREATE OR REPLACE VIEW vista_medicamentos AS
SELECT 
    p.id AS producto_id,
    p.nombre,
    p.sku,
    p.precio,
    p.stock,
    p.descripcion,
    c.nombre AS categoria_nombre,
    dm.laboratorio,
    dm.principio_activo,
    dm.requiere_receta,
    dm.fecha_vencimiento,
    dm.numero_lote,
    p.creado_en,
    p.actualizado_en
FROM productos p
JOIN detalles_medicamentos dm ON p.id = dm.producto_id
LEFT JOIN categorias c ON p.categoria_id = c.id
WHERE p.tipo_producto = 'MEDICAMENTO';

-- Vista Completa de Perfumes
CREATE OR REPLACE VIEW vista_perfumes AS
SELECT 
    p.id AS producto_id,
    p.nombre,
    p.sku,
    p.precio,
    p.stock,
    p.descripcion,
    c.nombre AS categoria_nombre,
    dp.marca,
    dp.familia_olfativa,
    dp.volumen_ml,
    dp.genero_objetivo,
    p.creado_en,
    p.actualizado_en
FROM productos p
JOIN detalles_perfumes dp ON p.id = dp.producto_id
LEFT JOIN categorias c ON p.categoria_id = c.id
WHERE p.tipo_producto = 'PERFUME';

-- Vista General del Catálogo (Para búsqueda rápida en POS / Inventario)
CREATE OR REPLACE VIEW vista_catalogo_general AS
SELECT 
    p.id,
    p.tipo_producto,
    p.nombre,
    p.sku,
    p.precio,
    p.stock,
    c.nombre AS categoria,
    COALESCE(dm.laboratorio, dp.marca) AS fabricante_o_marca,
    dm.principio_activo,
    dm.requiere_receta,
    dm.fecha_vencimiento,
    dm.numero_lote,
    dp.familia_olfativa,
    dp.volumen_ml,
    dp.genero_objetivo
FROM productos p
LEFT JOIN categorias c ON p.categoria_id = c.id
LEFT JOIN detalles_medicamentos dm ON p.id = dm.producto_id
LEFT JOIN detalles_perfumes dp ON p.id = dp.producto_id;

-- =========================================================================
-- DATOS DE PRUEBA (EJEMPLOS DE INSERCIÓN)
-- =========================================================================

-- Inserción de Categorías
INSERT INTO categorias (nombre, descripcion, esta_activo) VALUES
('Analgésicos y Antiinflamatorios', 'Alivio del dolor, inflamación y fiebre', TRUE),
('Antibióticos', 'Tratamiento de infecciones bacterianas con receta médica', TRUE),
('Cuidado Personal', 'Higiene, dermocosmética y aseo diario', TRUE),
('Fragancias y Perfumería Fina', 'Colonias, perfumes y lociones para damas, caballeros y unisex', TRUE);

-- Inserción de un Medicamento
INSERT INTO productos (categoria_id, tipo_producto, nombre, sku, precio, stock, descripcion)
VALUES (1, 'MEDICAMENTO', 'Panadol Forte 500mg/65mg', 'MED-PAN-001', 1.50, 200, 'Paracetamol con Cafeína para dolor de cabeza fuerte');

INSERT INTO detalles_medicamentos (producto_id, laboratorio, principio_activo, requiere_receta, fecha_vencimiento, numero_lote)
VALUES (CURRVAL('productos_id_seq'), 'GlaxoSmithKline (GSK)', 'Paracetamol + Cafeína', FALSE, '2028-06-30', 'LOTE-PF2026');

-- Inserción de un Perfume
INSERT INTO productos (categoria_id, tipo_producto, nombre, sku, precio, stock, descripcion)
VALUES (4, 'PERFUME', 'Acqua Di Giò Eau de Toilette', 'PER-ADG-100', 380.00, 15, 'Fragancia marina aromática icónica para hombre');

INSERT INTO detalles_perfumes (producto_id, marca, familia_olfativa, volumen_ml, genero_objetivo)
VALUES (CURRVAL('productos_id_seq'), 'Giorgio Armani', 'Cítrico / Acuático', 100, 'HOMBRE');
