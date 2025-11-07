{{/*
Expand the name of the chart.
*/}}
{{- define "theai.name" -}}
theai
{{- end }}

{{/*
Create chart name and version.
*/}}
{{- define "theai.chart" -}}
{{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "theai.labels" -}}
helm.sh/chart: {{ include "theai.chart" . }}
app.kubernetes.io/name: {{ include "theai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "theai.selectorLabels" -}}
app.kubernetes.io/name: {{ include "theai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}