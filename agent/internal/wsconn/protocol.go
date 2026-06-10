package wsconn

import "encoding/json"

type Msg map[string]interface{}

func (m Msg) Type() string {
	s, _ := m["type"].(string)
	return s
}

func (m Msg) SessionID() string {
	s, _ := m["sessionId"].(string)
	return s
}

func (m Msg) String(key string) string {
	s, _ := m[key].(string)
	return s
}

func (m Msg) Float(key string) float64 {
	f, _ := m[key].(float64)
	return f
}

func (m Msg) Bool(key string) bool {
	b, _ := m[key].(bool)
	return b
}

func (m Msg) Map(key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	return v
}

func Parse(data []byte) (Msg, error) {
	var m Msg
	return m, json.Unmarshal(data, &m)
}

func Encode(m Msg) ([]byte, error) {
	return json.Marshal(m)
}
