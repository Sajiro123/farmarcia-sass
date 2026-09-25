# Reglas del Espacio de Trabajo - Farmacia SaaS

## Ejecución Autónoma de Comandos de Terminal
1. **Ejecución Proactiva**:
   - Ejecutar directamente los comandos de terminal necesarios (compilación con `ng build`, despliegue en Docker, consultas a base de datos, diagnósticos de red) sin pedir confirmación manual previa al usuario en el chat.
   - No formular preguntas como "¿Deseas que ejecute este comando?"; invocar directamente la herramienta `run_command`.

2. **Compatibilidad con Windows / PowerShell**:
   - En este entorno Windows con restricciones de política de ejecución de scripts de PowerShell, ejecutar comandos de npm o scripts envolviéndolos con `cmd /c "..."` (por ejemplo: `cmd /c "npm run build"`).
   - Siempre que se recompile el frontend, sincronizar el contenedor Docker (`docker cp dist/farmacia-medicare-saas/browser/. farmacia-frontend:/usr/share/nginx/html/ && docker exec farmacia-frontend nginx -s reload`).
