/**
 * Admin Performance Dashboard Routes
 * Provides endpoints for performance monitoring dashboard
 */

const express = require('express');
const router = express.Router();

// Dashboard HTML page
router.get('/admin/performance', (req, res) => {
    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zone News API - Performance Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .metric-value { font-size: 2em; font-weight: bold; color: #2196F3; }
            .metric-label { color: #666; margin-top: 5px; }
            .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
            .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
            .alert-error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .chart-container { height: 300px; margin: 20px 0; }
            .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
            .status-healthy { background: #4CAF50; }
            .status-warning { background: #FF9800; }
            .status-critical { background: #F44336; }
            .refresh-time { color: #666; font-size: 0.9em; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background: #f8f9fa; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚀 Zone News API Performance Dashboard</h1>
            <p>Real-time monitoring and performance metrics</p>
            <div class="refresh-time">Last updated: <span id="lastUpdate">Loading...</span></div>
        </div>
        
        <div id="alerts"></div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value" id="responseTime">-</div>
                <div class="metric-label">Average Response Time (ms)</div>
                <span class="status-indicator" id="responseTimeStatus"></span>
            </div>
            
            <div class="metric-card">
                <div class="metric-value" id="memoryUsage">-</div>
                <div class="metric-label">Memory Usage (MB)</div>
                <span class="status-indicator" id="memoryStatus"></span>
            </div>
            
            <div class="metric-card">
                <div class="metric-value" id="errorRate">-</div>
                <div class="metric-label">Error Rate (%)</div>
                <span class="status-indicator" id="errorRateStatus"></span>
            </div>
            
            <div class="metric-card">
                <div class="metric-value" id="concurrentRequests">-</div>
                <div class="metric-label">Concurrent Requests</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value" id="totalRequests">-</div>
                <div class="metric-label">Total Requests</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value" id="dbQueryTime">-</div>
                <div class="metric-label">Avg DB Query Time (ms)</div>
            </div>
        </div>
        
        <div class="metric-card">
            <h3>📊 Response Time Trend</h3>
            <div class="chart-container">
                <canvas id="responseTimeChart"></canvas>
            </div>
        </div>
        
        <div class="metric-card">
            <h3>💾 Memory Usage Trend</h3>
            <div class="chart-container">
                <canvas id="memoryChart"></canvas>
            </div>
        </div>
        
        <div class="metric-card">
            <h3>🎯 Endpoint Performance</h3>
            <div id="endpointStats"></div>
        </div>
        
        <script>
            let responseTimeChart, memoryChart;
            
            // Initialize charts
            function initCharts() {
                const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
                responseTimeChart = new Chart(responseTimeCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Response Time (ms)',
                            data: [],
                            borderColor: '#2196F3',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
                
                const memoryCtx = document.getElementById('memoryChart').getContext('2d');
                memoryChart = new Chart(memoryCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Heap Used (MB)',
                            data: [],
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            }
            
            // Update dashboard with metrics
            function updateDashboard(stats) {
                document.getElementById('responseTime').textContent = stats.averageResponseTime.toFixed(2);
                document.getElementById('memoryUsage').textContent = stats.currentMemoryUsage.toFixed(1);
                document.getElementById('errorRate').textContent = stats.errorRate.toFixed(2);
                document.getElementById('concurrentRequests').textContent = stats.concurrentRequests;
                document.getElementById('totalRequests').textContent = stats.totalRequests;
                document.getElementById('dbQueryTime').textContent = stats.database.averageQueryTime.toFixed(2);
                document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                
                // Update status indicators
                updateStatusIndicator('responseTimeStatus', stats.averageResponseTime, 200, 500);
                updateStatusIndicator('memoryStatus', stats.currentMemoryUsage, 100, 150);
                updateStatusIndicator('errorRateStatus', stats.errorRate, 1, 5);
                
                // Update charts
                updateResponseTimeChart(stats);
                updateMemoryChart(stats);
                updateEndpointStats(stats.endpoints);
            }
            
            function updateStatusIndicator(elementId, value, warningThreshold, criticalThreshold) {
                const element = document.getElementById(elementId);
                element.className = 'status-indicator ';
                
                if (value < warningThreshold) {
                    element.className += 'status-healthy';
                } else if (value < criticalThreshold) {
                    element.className += 'status-warning';
                } else {
                    element.className += 'status-critical';
                }
            }
            
            function updateResponseTimeChart(stats) {
                const now = new Date().toLocaleTimeString();
                responseTimeChart.data.labels.push(now);
                responseTimeChart.data.datasets[0].data.push(stats.averageResponseTime);
                
                // Keep last 20 data points
                if (responseTimeChart.data.labels.length > 20) {
                    responseTimeChart.data.labels.shift();
                    responseTimeChart.data.datasets[0].data.shift();
                }
                
                responseTimeChart.update('none');
            }
            
            function updateMemoryChart(stats) {
                if (stats.memoryTrend && stats.memoryTrend.length > 0) {
                    const latest = stats.memoryTrend[stats.memoryTrend.length - 1];
                    const time = new Date(latest.timestamp).toLocaleTimeString();
                    
                    memoryChart.data.labels.push(time);
                    memoryChart.data.datasets[0].data.push(latest.heapUsed);
                    
                    // Keep last 20 data points
                    if (memoryChart.data.labels.length > 20) {
                        memoryChart.data.labels.shift();
                        memoryChart.data.datasets[0].data.shift();
                    }
                    
                    memoryChart.update('none');
                }
            }
            
            function updateEndpointStats(endpoints) {
                const container = document.getElementById('endpointStats');
                let html = '<table>';
                html += '<tr><th>Endpoint</th><th>Avg Time</th><th>Requests</th><th>Error Rate</th></tr>';
                
                Object.entries(endpoints || {}).forEach(([endpoint, stats]) => {
                    html += '<tr>';
                    html += '<td>' + endpoint + '</td>';
                    html += '<td>' + stats.averageDuration.toFixed(2) + 'ms</td>';
                    html += '<td>' + stats.count + '</td>';
                    html += '<td>' + stats.errorRate.toFixed(1) + '%</td>';
                    html += '</tr>';
                });
                
                html += '</table>';
                container.innerHTML = html;
            }
            
            // Initial load
            function loadMetrics() {
                fetch('/api/admin/performance/metrics')
                    .then(response => response.json())
                    .then(data => {
                        updateDashboard(data);
                        if (!responseTimeChart) {
                            initCharts();
                        }
                    })
                    .catch(error => console.error('Error loading metrics:', error));
            }
            
            // Initial load and periodic refresh
            loadMetrics();
            setInterval(loadMetrics, 5000); // Every 5 seconds
        </script>
    </body>
    </html>`;
    
    res.send(dashboardHtml);
});

// API endpoint for metrics data
router.get('/admin/performance/metrics', (req, res) => {
    try {
        const metricsService = req.app.locals.metricsService;
        const stats = metricsService.getStatistics();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// API endpoint for alert history
router.get('/admin/performance/alerts', (req, res) => {
    try {
        const alertingService = req.app.locals.alertingService;
        const alerts = alertingService.getAlertHistory();
        res.json({ alerts });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// Acknowledge alert
router.post('/admin/performance/alerts/:alertId/acknowledge', (req, res) => {
    try {
        const { alertId } = req.params;
        const alertingService = req.app.locals.alertingService;
        alertingService.acknowledgeAlert(alertId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

// Export metrics data
router.get('/admin/performance/export', (req, res) => {
    try {
        const metricsService = req.app.locals.metricsService;
        const stats = metricsService.getStatistics();
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=performance-metrics.json');
        res.json({
            exportTime: new Date(),
            statistics: stats,
            requestMetrics: metricsService.requestMetrics.getRecent(1000),
            dbMetrics: metricsService.dbMetrics.getRecent(500)
        });
    } catch (error) {
        console.error('Error exporting metrics:', error);
        res.status(500).json({ error: 'Failed to export metrics' });
    }
});

module.exports = router;