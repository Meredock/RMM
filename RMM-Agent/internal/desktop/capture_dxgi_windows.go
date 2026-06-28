//go:build windows

package desktop

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/jpeg"
	"log"

	"github.com/kirides/go-d3d/d3d11"
	"github.com/kirides/go-d3d/outputduplication"
)

// newCapturer prefers DXGI Desktop Duplication and falls back to GDI BitBlt when
// DXGI is unavailable (e.g. very old Windows).
func newCapturer() screenCapturer {
	if d, err := newDXGICapturer(); err == nil {
		log.Printf("[desktop] capture: using DXGI Desktop Duplication")
		return &winCapturer{dxgi: d}
	} else {
		log.Printf("[desktop] capture: DXGI unavailable (%v); using GDI BitBlt", err)
	}
	return &winCapturer{}
}

// winCapturer wraps the DXGI capturer, re-initialising it on transient
// desktop-switch errors (DXGI_ERROR_ACCESS_LOST) and falling back to GDI if DXGI
// keeps failing.
type winCapturer struct {
	dxgi      *dxgiCapturer
	dxgiFails int
}

func (c *winCapturer) frame() (string, int, int, error) {
	if c.dxgi != nil {
		b64, w, h, err := c.dxgi.frame()
		if err == nil {
			c.dxgiFails = 0
			return b64, w, h, nil
		}
		if errors.Is(err, outputduplication.ErrNoImageYet) {
			return "", 0, 0, err // transient; caller skips this tick
		}
		// Real DXGI error — usually a desktop switch (lock/UAC/resolution change).
		c.dxgiFails++
		c.dxgi.close()
		c.dxgi = nil
		if c.dxgiFails <= 5 {
			if d, e := newDXGICapturer(); e == nil {
				c.dxgi = d
			} else {
				log.Printf("[desktop] capture: DXGI lost (%v); falling back to GDI", err)
			}
		} else {
			log.Printf("[desktop] capture: DXGI failing repeatedly; staying on GDI")
		}
		return "", 0, 0, err
	}
	return captureScreen() // GDI fallback
}

func (c *winCapturer) close() {
	if c.dxgi != nil {
		c.dxgi.close()
	}
}

// dxgiCapturer grabs the screen with the Desktop Duplication API (DXGI). Unlike
// GDI BitBlt, this reads the composed desktop straight from the DWM, so it works
// on GPUs, VMs and RDP setups where GDI returns a black frame.
type dxgiCapturer struct {
	device *d3d11.ID3D11Device
	ctx    *d3d11.ID3D11DeviceContext
	ddup   *outputduplication.OutputDuplicator
	img    *image.RGBA
	got    bool // have we captured at least one frame
}

func newDXGICapturer() (*dxgiCapturer, error) {
	device, ctx, err := d3d11.NewD3D11Device()
	if err != nil {
		return nil, err
	}
	ddup, err := outputduplication.NewIDXGIOutputDuplication(device, ctx, 0)
	if err != nil {
		device.Release()
		ctx.Release()
		return nil, err
	}
	ddup.DrawPointer = true       // include the mouse cursor in the frame
	ddup.UpdatePointerInfo = true // track cursor changes
	bounds, err := ddup.GetBounds()
	if err != nil {
		ddup.Release()
		device.Release()
		ctx.Release()
		return nil, err
	}
	return &dxgiCapturer{device: device, ctx: ctx, ddup: ddup, img: image.NewRGBA(bounds)}, nil
}

func (c *dxgiCapturer) frame() (string, int, int, error) {
	err := c.ddup.GetImage(c.img, 250)
	switch {
	case err == nil:
		c.got = true
	case errors.Is(err, outputduplication.ErrNoImageYet):
		// Screen unchanged. Re-send the last frame so the viewer stays fed; if we
		// haven't captured anything yet, report it so the caller waits.
		if !c.got {
			return "", 0, 0, err
		}
	default:
		return "", 0, 0, err
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, c.img, &jpeg.Options{Quality: 40}); err != nil {
		return "", 0, 0, err
	}
	b := c.img.Bounds()
	return base64.StdEncoding.EncodeToString(buf.Bytes()), b.Dx(), b.Dy(), nil
}

func (c *dxgiCapturer) close() {
	if c.ddup != nil {
		c.ddup.Release()
	}
	if c.ctx != nil {
		c.ctx.Release()
	}
	if c.device != nil {
		c.device.Release()
	}
}
